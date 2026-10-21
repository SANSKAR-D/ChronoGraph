## 2. Database Schema Specification (PostgreSQL)

```sql
CREATE TYPE run_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED', 'ABORTED');
CREATE TYPE node_exec_status AS ENUM ('IDLE', 'QUEUED', 'RUNNING', 'RETRYING', 'SUCCESS', 'FAILED', 'DLQ');
CREATE TYPE trigger_source AS ENUM ('WEBHOOK', 'CRON', 'MANUAL');

-- 1. Workflow Blueprints
CREATE TABLE workflow_blueprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    webhook_secret VARCHAR(128) NOT NULL,
    cron_expression VARCHAR(64),
    nodes_json JSONB NOT NULL,          -- Array of DAGNode definitions
    edges_json JSONB NOT NULL,          -- Array of DAGEdge definitions
    adjacency_map JSONB NOT NULL,       -- Pre-compiled { parentId: [childId1, childId2] }
    base_indegrees JSONB NOT NULL,      -- Pre-compiled { nodeId: integer_count }
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Workflow Execution Runs
CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflow_blueprints(id) ON DELETE CASCADE,
    status run_status NOT NULL DEFAULT 'PENDING',
    trigger_type trigger_source NOT NULL,
    trigger_payload JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 3. Immutable Node Execution Telemetry Logs
CREATE TABLE node_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_id VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(64) NOT NULL UNIQUE,
    status node_exec_status NOT NULL,
    attempt_number INT NOT NULL DEFAULT 1,
    input_payload JSONB,
    output_payload JSONB,
    error_message TEXT,
    http_status_code INT,
    duration_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Dead-Letter Queue (DLQ) Archive
CREATE TABLE dead_letter_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL,
    node_id VARCHAR(128) NOT NULL,
    failed_payload JSONB NOT NULL,
    last_error TEXT NOT NULL,
    attempts_made INT NOT NULL,
    replayed BOOLEAN DEFAULT FALSE,
    failed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runs_workflow ON workflow_runs(workflow_id, started_at DESC);
CREATE INDEX idx_logs_run_node ON node_execution_logs(run_id, node_id);
```

---

## 3. Core Algorithms & Atomic Redis Scripts

### 3.1 Cycle Detection & Blueprint Validation: $O(V + E)$

We enforce acyclic constraints at two levels:

- **Client-Side (Interactive Edge Guard):** Three-color Depth-First Search (`WHITE = 0`, `GRAY = 1`, `BLACK = 2`) runs in the browser whenever a user drags a wire between two ports. If `targetNode` can reach `sourceNode`, the connection is rejected and highlighted in crimson.
- **Server-Side (Kahn's Topological Verification):** Before saving to PostgreSQL, the backend computes $\text{in-degree}(v)$ for all vertices $V$, pushes all $u \in V$ with $\text{in-degree}(u) = 0$ into a queue $Q$, and iteratively pops vertices while decrementing neighbors. If `visited_count !== V.length`, the graph contains a cycle and the API returns `422 Unprocessable Entity`.

### 3.2 Atomic Diamond-Dependency Resolution (Redis Lua Script)

To eliminate Read-Modify-Write race conditions when parallel parent nodes $B$ and $C$ finish at the exact same millisecond ($A \rightarrow \{B, C\} \rightarrow D$), workers execute this single-threaded Lua script inside Redis:

```lua
-- KEYS[1]: run:{runId}:indegree (Redis Hash storing remaining parent counts)
-- KEYS[2]: run:{runId}:completed_nodes (Redis Set of finished nodes)
-- ARGV[1]: completedParentNodeId
-- ARGV[2..N]: downstreamChildNodeIds

-- Guard against duplicate parent completion
if redis.call("SISMEMBER", KEYS[2], ARGV[1]) == 1 then
    return {}
end
redis.call("SADD", KEYS[2], ARGV[1])

local unlockedChildren = {}
for i = 2, #ARGV do
    local childId = ARGV[i]
    local remaining = redis.call("HINCRBY", KEYS[1], childId, -1)
    if remaining == 0 then
        table.insert(unlockedChildren, childId)
    end
end

return unlockedChildren
```

**Guarantee:** Because Redis executes Lua scripts atomically, only the exact worker thread that decrements `remaining` to `0` receives `childId` in `unlockedChildren` and enqueues it into BullMQ.

### 3.3 Deterministic Idempotency & Retry Jitter

**Idempotency Lock:**

$$K_{\text{idempotent}} = \text{SHA-256}(\text{run\_id} \mathbin{\Vert} \text{node\_id} \mathbin{\Vert} \text{attempt})$$

Workers acquire `SET lock:idem:{K} "LOCKED" NX EX 3600` before executing external side effects and inject `X-Idempotency-Key: {K}` into outbound HTTP headers.

**Exponential Backoff with Full Jitter:**

$$T_{\text{delay}} = \text{random}\left(0, \min\left(T_{\text{cap}}, T_{\text{base}} \times 2^{\text{attempt}}\right)\right)$$

Configured as a custom `backoffStrategy` inside the BullMQ Worker settings.

---

## 4. Real-Time SSE Telemetry Protocol

Instead of polling PostgreSQL, the frontend subscribes to `/api/v1/runs/:runId/stream`.

**Event Format:**

```json
{
  "event": "NODE_STATE_CHANGE",
  "runId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "nodeId": "node_http_settlement",
  "status": "RETRYING",
  "attempt": 2,
  "durationMs": 412,
  "indegreeRemaining": 0,
  "payloadPreview": { "statusCode": 503, "error": "Upstream Gateway Timeout" },
  "nextRetryDelayMs": 2340,
  "timestamp": "2026-10-19T12:00:04.210Z"
}
```

---

## 5. Failure Modes & Recovery Paths (Viva Defense Matrix)

| Failure Scenario | Naive System Failure | ChronoGraph Recovery Path |
|---|---|---|
| **1. Worker container crashes mid-execution** (OOM / SIGKILL) | Job vanishes in memory; workflow hangs forever in `RUNNING` state. | BullMQ worker lock expires after a missed heartbeat (`lockDuration: 15000ms`); the stalled-job checker automatically moves the job back to the wait queue for a healthy worker. |
| **2. Simultaneous parallel parent completion** ($A \rightarrow \{B, C\} \rightarrow D$) | Race condition on DB read causes Node $D$ to fire twice or zero times. | Atomic Redis Lua `HINCRBY` script serializes the decrement in sub-millisecond memory; exactly one worker sees `0` and enqueues Node $D$. |
| **3. Downstream third-party API outage** (HTTP 502/503) | Immediate retry loop DDoSes the target API and crashes the workflow. | BullMQ schedules a delayed retry in a Redis ZSET using Full Jitter backoff; if `attempt == maxRetries`, the job routes to the Dead-Letter Queue (DLQ) for manual 1-click replay. |
