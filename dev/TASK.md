# ChronoGraph — Execution Roadmap & Task Breakdown (`TASK.md`)
**Team Structure:** Up to 3 Members (Frontend/Studio, Backend/Orchestrator, Workers/Telemetry/QA)[cite: 2, 18]  
**Git Rule Reminder:** Create repository ONLY after the development period officially starts; make clean, incremental commits[cite: 2, 16].

---

## Phase 1: Repository Genesis & Infrastructure Setup (Hours 0–3)
- [x] **T1.1:** Initialize monorepo or Next.js 15/16 (App Router + TypeScript) project after official start time[cite: 2, 18].
- [x] **T1.2:** Configure `docker-compose.yml` with **PostgreSQL 16** and **Redis 7-alpine** so any mentor/judge can boot the entire backing stack with `docker compose up -d`[cite: 2, 16, 18].
- [x] **T1.3:** Set up Prisma or Drizzle ORM and run initial database migrations for `workflow_blueprints`, `workflow_runs`, `node_execution_logs`, and `dead_letter_jobs`[cite: 18].
- [x] **T1.4:** Install core dependencies: `@xyflow/react`, `motion`, `react-aria-components`, `bullmq`, `ioredis`, `lucide-react`, and Tailwind CSS[cite: 8, 18].

---

## Phase 2: Core DAG Engine & Topological Orchestrator (Hours 3–10)
- [x] **T2.1 (Cycle Detection Module):** Implement shared `validateDAG(nodes, edges)` utility in `src/lib/dag/cycle-detector.ts` using both 3-color DFS (returns exact cycle path for UI highlighting) and Kahn's in-degree algorithm[cite: 8, 18].
- [x] **T2.2 (Unit Tests for DAG Math):** Write Vitest unit tests proving `validateDAG` catches self-loops, 2-node loops, and deep 6-node transitive cycles[cite: 8].
- [x] **T2.3 (Redis Lua Fan-Out Script):** Implement `src/lib/redis/lua-scripts.ts` containing the atomic `HINCRBY` in-degree decrement script and idempotency lock acquisition (`SET NX`)[cite: 8, 18].
- [x] **T2.4 (Webhook Ingestion API):** Build `POST /api/v1/hooks/[webhookId]/route.ts` that verifies HMAC signatures, seeds `run:{id}:indegree` in Redis, enqueues root nodes (`in-degree == 0`), and returns `202 Accepted` in $< 25\text{ ms}$[cite: 8, 18].
- [x] **T2.5 (Cron Trigger Scheduler):** Connect BullMQ repeatable jobs (`queue.upsertJobScheduler`) to trigger workflows on cron schedules[cite: 8, 18].

---

## Phase 3: Distributed Worker Pool & Fault Resilience (Hours 10–18)
- [ ] **T3.1 (Worker Process Entrypoint):** Build standalone worker runner (`src/workers/dag-worker.ts`) with configurable concurrency and Redis heartbeat emission (`worker:heartbeat:{workerId}`)[cite: 8, 18].
- [ ] **T3.2 (Node Executors):**
  - [ ] `executeHttpNode`: Outbound `fetch` with timeout, custom headers, `X-Idempotency-Key` injection, and template variable replacement (`{{node_1.data.userId}}`)[cite: 8, 18].
  - [ ] `executeTransformNode`: Safe JSON path mapping / filtering[cite: 8, 18].
  - [ ] `executeDelayNode`: Non-blocking BullMQ delayed transition[cite: 8, 18].
<<<<<<< HEAD
- [x] **T3.3 (Exponential Backoff + Full Jitter):** Configure BullMQ custom backoff strategy: `Math.floor(Math.random() * Math.min(maxCap, base * Math.pow(2, attempt)))`[cite: 8, 18].
- [x] **T3.4 (Dead-Letter Queue Routing):** Hook into BullMQ `failed` event; when `job.attemptsMade >= job.opts.attempts`, persist failure context to `dead_letter_jobs`, mark downstream dependent nodes as `SKIPPED/HALTED`, and publish `DLQ_ROUTED` event[cite: 8, 18].
- [ ] **T3.5 (DLQ Replay Endpoint):** Create `POST /api/v1/dlq/[jobId]/replay` to re-inject a fixed job back into the topological execution flow[cite: 8, 18].
=======
- [ ] **T3.3 (Exponential Backoff + Full Jitter):** Configure BullMQ custom backoff strategy: `Math.floor(Math.random() * Math.min(maxCap, base * Math.pow(2, attempt)))`[cite: 8, 18].
- [ ] **T3.4 (Dead-Letter Queue Routing):** Hook into BullMQ `failed` event; when `job.attemptsMade >= job.opts.attempts`, persist failure context to `dead_letter_jobs`, mark downstream dependent nodes as `SKIPPED/HALTED`, and publish `DLQ_ROUTED` event[cite: 8, 18].
- [x] **T3.5 (DLQ Replay Endpoint):** Create `POST /api/v1/dlq/[jobId]/replay` to re-inject a fixed job back into the topological execution flow[cite: 8, 18].
>>>>>>> a528cf9c5895780c2135284c257ef2ec88b92e02

---

## Phase 4: Real-Time SSE Telemetry & API Endpoints (Hours 18–22)
- [ ] **T4.1 (Redis Pub/Sub Publisher):** Emit structured JSON events from workers on every state change (`RUNNING`, `RETRYING`, `SUCCESS`, `DLQ`) to `channel:run:{runId}`[cite: 8, 18].
- [ ] **T4.2 (SSE Streaming Route):** Build `GET /api/v1/runs/[runId]/stream/route.ts` using `ReadableStream` and `text/event-stream` headers to pipe Redis Pub/Sub events to the browser[cite: 8, 18].
- [ ] **T4.3 (Cluster Telemetry Endpoint):** Build `GET /api/v1/cluster/health` returning active worker count, heartbeat timestamps, and queue metrics (Waiting, Active, Delayed, DLQ)[cite: 8, 18].

---

## Phase 5: Frontend Studio, 3D Hero & Live Canvas Integration (Hours 22–30)
- [ ] **T5.1 (3D Spatial Landing Page):** Integrate the `ChronoGraph3DHero` component with cursor-reactive 3D tilt, Isometric Lock toggle, and instant **"Launch Studio"** transition[cite: 18].
- [ ] **T5.2 (React Flow Studio Canvas):** Build custom node components (`TriggerNode`, `HttpNode`, `TransformNode`, `DelayNode`) with live status rings (`Idle`, `Running`, `Retrying`, `Success`, `DLQ`)[cite: 8, 18].
- [ ] **T5.3 (Interactive Cycle Guard on Canvas):** Hook `onConnect` in React Flow to run client-side DFS; if a cycle is created, animate a red dashed edge and fire a toast error[cite: 8, 18].
- [ ] **T5.4 (Accessible Node Inspector Drawer):** Build slide-over configuration forms using `react-aria-components` for editing node parameters, retry caps, and cron schedules[cite: 8, 18].
- [ ] **T5.5 (Live SSE Log Drawer & Replay Tab):** Connect `EventSource` to `/api/v1/runs/[runId]/stream` so nodes light up in real time as workers execute them, with a bottom terminal showing live step logs and a DLQ Replay tab[cite: 8, 18].

---

## Phase 6: Benchmarks, Chaos Demo & Viva Defense Prep (Hours 30–36)
- [ ] **T6.1 (Pre-Seeded Demo Workflows):** Seed 3 ready-to-run templates on startup so judges don't start with an empty canvas[cite: 16]:
  1. *Diamond Payment Settlement DAG* (Demonstrates parallel fan-out & atomic fan-in)[cite: 18].
  2. *Chaos Flaky API Pipeline* (Demonstrates Exponential Backoff + Jitter & DLQ Replay)[cite: 8, 18].
  3. *Cron Data Sync Pipeline* (Demonstrates scheduled triggers & JSON transformation)[cite: 8].
- [ ] **T6.2 (Load Test Benchmark Script):** Write `scripts/benchmark-load.ts` (or k6 script) firing 200 concurrent webhook requests and outputting $p50$, $p95$, $p99$ ingestion latency and zero double-execution proof[cite: 8, 18].
- [ ] **T6.3 (Comprehensive README & Tool Disclosure):** Document the architecture diagram, Kahn's cycle-detection math, Lua script explanation, benchmark tables, and complete tool disclosure (`@xyflow/react`, `motion`, `Skiper UI`, `Kokonut UI`, `react-aria-components`, `BullMQ`, `Redis`, `PostgreSQL`) before commit freeze[cite: 2, 8, 16, 18].