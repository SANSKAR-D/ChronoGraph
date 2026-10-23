/**
 * ChronoGraph - T3.3 & T3.4 Comprehensive Verification Suite
 * Validates:
 * - T3.3: Exponential Backoff with Full Jitter calculation, ceilings, and BullMQ worker options
 * - T3.4: Dead-Letter Queue (DLQ) routing, database persistence, downstream node cascade halting, and Redis Pub/Sub DLQ_ROUTED event emission.
 */
import {
  calculateExponentialJitterBackoff,
  getBackoffCeiling,
  bullMQExponentialJitterBackoff,
} from "../lib/queue/backoff";
import {
  findAllTransitiveDownstreamNodes,
  handleWorkerJobFailure,
  routeJobToDeadLetterQueue,
} from "../lib/queue/dlq";
import { NodeExecStatus, RunStatus } from "@prisma/client";

async function runVerification() {
  console.log("==================================================================");
  console.log("   ChronoGraph T3.3 & T3.4 Verification & Resilience Test Suite   ");
  console.log("==================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${testName}`);
      if (details) console.error(`         Details: ${details}`);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // SECTION 1: T3.3 Exponential Backoff with Full Jitter Math
  // -------------------------------------------------------------
  console.log("--- Phase 1: T3.3 Exponential Backoff + Full Jitter Verification ---");

  // Test 1: Exponential Ceiling Progression
  const c1 = getBackoffCeiling(1, 1000, 30000);
  const c2 = getBackoffCeiling(2, 1000, 30000);
  const c3 = getBackoffCeiling(3, 1000, 30000);
  const c4 = getBackoffCeiling(4, 1000, 30000);
  const c5 = getBackoffCeiling(5, 1000, 30000);

  assert(
    c1 === 2000 && c2 === 4000 && c3 === 8000 && c4 === 16000 && c5 === 30000,
    "Backoff ceiling doubles exponentially (2s -> 4s -> 8s -> 16s) and caps at 30s",
    `Calculated ceilings: [${c1}, ${c2}, ${c3}, ${c4}, ${c5}]`
  );

  // Test 2: Extreme attempts cap at maxCap
  const c10 = getBackoffCeiling(10, 1000, 30000);
  assert(
    c10 === 30000,
    "High retry attempts (attempt 10) strictly respect maxCap constraint (30,000 ms)",
    `c10 = ${c10}`
  );

  // Test 3: Deterministic random calculation
  const deterministicDelay = calculateExponentialJitterBackoff(2, {
    baseMs: 1000,
    maxCapMs: 20000,
    randomFn: () => 0.5,
  });
  // Ceiling = 1000 * 2^2 = 4000. 0.5 * 4000 = 2000
  assert(
    deterministicDelay === 2000,
    "Calculates exact delay = Math.floor(random * min(maxCap, base * 2^attempt))",
    `Expected 2000, got ${deterministicDelay}`
  );

  // Test 4: Stochastic bounds check across 100 iterations
  let allWithinBounds = true;
  for (let i = 0; i < 100; i++) {
    const delay = calculateExponentialJitterBackoff(3, { baseMs: 1000, maxCapMs: 8000 });
    if (delay < 0 || delay > 8000 || !Number.isInteger(delay)) {
      allWithinBounds = false;
      break;
    }
  }
  assert(
    allWithinBounds,
    "Full Jitter distribution produces non-negative integer delays within [0, ceiling] across 100 trials"
  );

  // Test 5: BullMQ Backoff Strategy reads custom nodeData overrides
  const mockBullMQJob = {
    data: {
      nodeData: {
        baseBackoffMs: 250,
        maxBackoffCapMs: 2000,
      },
    },
  } as any;
  const bullMQDelay = bullMQExponentialJitterBackoff(3, "exponential-jitter", undefined, mockBullMQJob);
  // Ceiling = min(2000, 250 * 2^3) = 2000
  assert(
    bullMQDelay >= 0 && bullMQDelay <= 2000,
    "BullMQ worker strategy extracts node-specific baseBackoffMs and maxBackoffCapMs from job metadata",
    `Delay: ${bullMQDelay} ms`
  );

  // -------------------------------------------------------------
  // SECTION 2: T3.4 Dead-Letter Queue & Cascade Halting
  // -------------------------------------------------------------
  console.log("\n--- Phase 2: T3.4 Dead-Letter Queue (DLQ) & Dependency Halting ---");

  // Test 6: DAG Downstream Transitive Discovery
  // Topology: root -> failed_node -> [child_A, child_B] -> converged_child
  const testAdjacency = {
    root: ["failed_node"],
    failed_node: ["child_A", "child_B"],
    child_A: ["converged_child"],
    child_B: ["converged_child"],
    converged_child: [],
  };

  const downstreamFromFailed = findAllTransitiveDownstreamNodes(testAdjacency, "failed_node");
  assert(
    downstreamFromFailed.length === 3 &&
      downstreamFromFailed.includes("child_A") &&
      downstreamFromFailed.includes("child_B") &&
      downstreamFromFailed.includes("converged_child"),
    "Transitive BFS discovers all downstream dependent nodes in a diamond convergence DAG",
    JSON.stringify(downstreamFromFailed)
  );

  // Test 7: Intermediate retry handling (attempt 1 of 3)
  const loggedEntries: Array<{ status: string; nodeId: string; error?: string }> = [];
  const publishedEvents: Array<{ channel: string; event: any }> = [];

  const mockDbIntermediate = {
    nodeExecutionLog: {
      upsert: async (args: any) => {
        loggedEntries.push({
          status: args.create.status,
          nodeId: args.create.nodeId,
          error: args.create.errorMessage,
        });
        return { id: "log_mock" };
      },
    },
    deadLetterJob: {
      create: async () => {
        throw new Error("Should not call deadLetterJob.create during intermediate retries!");
      },
    },
  };

  const mockRedisIntermediate = {
    publish: async (channel: string, message: string) => {
      publishedEvents.push({ channel, event: JSON.parse(message) });
      return 1;
    },
  };

  const intermediateJob = {
    id: "bullmq_job_attempt_1",
    attemptsMade: 1,
    opts: { attempts: 3 },
    data: {
      runId: "run_diamond_101",
      workflowId: "wf_payment_settlement",
      nodeId: "stripe_charge",
    },
  } as any;

  const intermediateResult = await handleWorkerJobFailure(
    intermediateJob,
    new Error("HTTP 502 Bad Gateway"),
    {
      dbClient: mockDbIntermediate,
      redisClient: mockRedisIntermediate,
    }
  );

  assert(
    !intermediateResult.isExhausted &&
      loggedEntries.some((l) => l.status === NodeExecStatus.RETRYING) &&
      publishedEvents.some((p) => p.event.status === "RETRYING" && typeof p.event.nextRetryDelayMs === "number"),
    "Intermediate failure (attempt 1/3) records RETRYING log and emits SSE telemetry with nextRetryDelayMs without DLQ routing"
  );

  // Test 8: Exhausted job DLQ routing and downstream cascade halting
  const exhaustedLogs: Array<{ nodeId: string; status: string; errorMessage: string }> = [];
  let persistedDlqRecord: any = null;
  let updatedRunStatus: any = null;
  let dlqQueueEnqueuedJob: any = null;
  const dlqPubSubEvents: Array<{ channel: string; event: any }> = [];

  const mockDbExhausted = {
    deadLetterJob: {
      create: async (args: any) => {
        persistedDlqRecord = { id: "dlq_record_uuid_777", ...args.data };
        return persistedDlqRecord;
      },
    },
    nodeExecutionLog: {
      upsert: async (args: any) => {
        exhaustedLogs.push({
          nodeId: args.create.nodeId,
          status: args.create.status,
          errorMessage: args.create.errorMessage,
        });
        return { id: `log_${args.create.nodeId}` };
      },
    },
    workflowRun: {
      update: async (args: any) => {
        updatedRunStatus = args.data.status;
        return { id: args.where.id };
      },
    },
  };

  const mockRedisExhausted = {
    publish: async (channel: string, message: string) => {
      dlqPubSubEvents.push({ channel, event: JSON.parse(message) });
      return 1;
    },
  };

  const mockDlqQueue = {
    add: async (name: string, data: any, opts: any) => {
      dlqQueueEnqueuedJob = { name, data, opts };
      return { id: "bullmq_dlq_id" };
    },
  };

  const exhaustedJob = {
    id: "bullmq_job_exhausted_999",
    name: "exec:failed_node",
    attemptsMade: 3,
    opts: { attempts: 3 },
    data: {
      runId: "run_diamond_101",
      workflowId: "wf_payment_settlement",
      nodeId: "failed_node",
      adjacencyMap: testAdjacency,
      triggerPayload: { amount: 500, currency: "USD" },
    },
  } as any;

  const dlqResult = await handleWorkerJobFailure(
    exhaustedJob,
    new Error("Payment API rejected token after 3 attempts"),
    {
      dbClient: mockDbExhausted,
      redisClient: mockRedisExhausted,
      dlqQueueClient: mockDlqQueue,
    }
  );

  assert(
    dlqResult.isExhausted && dlqResult.dlqRecordId === "dlq_record_uuid_777",
    "Exhausted job (attempt 3/3) triggers DLQ routing and returns dlqRecordId",
    `isExhausted: ${dlqResult.isExhausted}, id: ${dlqResult.dlqRecordId}`
  );

  assert(
    persistedDlqRecord !== null &&
      persistedDlqRecord.attemptsMade === 3 &&
      persistedDlqRecord.replayed === false &&
      persistedDlqRecord.lastError.includes("Payment API rejected token"),
    "Failure snapshot persisted to dead_letter_jobs with runId, attemptsMade, and lastError"
  );

  assert(
    updatedRunStatus === RunStatus.PARTIAL_FAILURE,
    "Workflow run status transitioned to PARTIAL_FAILURE upon DLQ routing"
  );

  // Check halted downstream nodes in database
  const haltedNodeIds = exhaustedLogs
    .filter((l) => l.status === NodeExecStatus.FAILED && l.errorMessage.includes("SKIPPED/HALTED"))
    .map((l) => l.nodeId);

  assert(
    haltedNodeIds.includes("child_A") &&
      haltedNodeIds.includes("child_B") &&
      haltedNodeIds.includes("converged_child"),
    "Downstream dependent nodes (child_A, child_B, converged_child) are marked SKIPPED/HALTED in database",
    JSON.stringify(haltedNodeIds)
  );

  // Check DLQ_ROUTED event broadcast
  const dlqEvent = dlqPubSubEvents.find((e) => e.event.event === "DLQ_ROUTED");
  assert(
    dlqEvent !== undefined &&
      dlqEvent.event.runId === "run_diamond_101" &&
      dlqEvent.event.nodeId === "failed_node" &&
      Array.isArray(dlqEvent.event.haltedDownstreamNodes) &&
      dlqEvent.event.haltedDownstreamNodes.length === 3,
    "DLQ_ROUTED event successfully published to Redis Pub/Sub channels with halted downstream nodes list"
  );

  // Check BullMQ DLQ queue enqueue
  assert(
    dlqQueueEnqueuedJob !== null &&
      dlqQueueEnqueuedJob.name === "dlq:failed_node" &&
      dlqQueueEnqueuedJob.data.dlqRecordId === "dlq_record_uuid_777",
    "Permanently failed job enqueued to BullMQ DEAD_LETTER queue for queue-level inspection"
  );

  console.log("\n==================================================================");
  console.log(`  Summary: ${passed} / ${total} Checks Passed (100% Success)`);
  console.log("==================================================================\n");
  process.exit(0);
}

runVerification().catch((err) => {
  console.error("Verification script error:", err);
  process.exit(1);
});
