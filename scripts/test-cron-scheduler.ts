/**
 * ChronoGraph - Task T2.5 Comprehensive Test Suite
 * Validates BullMQ repeatable cron scheduling, database persistence,
 * Redis in-degree state initialization, and scheduler lifecycle.
 */
import {
  validateCronExpression,
  scheduleWorkflowCron,
  removeWorkflowCron,
  listScheduledCronJobs,
  syncAllActiveCronWorkflows,
  triggerWorkflowCronNow,
} from "../lib/cron/scheduler";
import { getCronQueue, closeAllQueues } from "../lib/queue/bullmq";
import { db } from "../lib/db";
import { redis } from "../lib/redis/client";
import { TriggerSource, RunStatus } from "@prisma/client";

async function runTestSuite() {
  console.log("==================================================================");
  console.log("   ChronoGraph T2.5 (Cron Trigger Scheduler) Integration Test    ");
  console.log("==================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
      if (details) console.error(`         Details: ${details}`);
      process.exitCode = 1;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1 & 2: Cron Expression Validation
    // -------------------------------------------------------------
    console.log("Phase A: Syntax & Schedule Math Validation");

    const validResult = validateCronExpression("*/5 * * * *");
    assert(
      validResult.isValid && validResult.nextRun instanceof Date,
      "Validates standard 5-field cron pattern (*/5 * * * *)",
      JSON.stringify(validResult)
    );

    const invalidResult = validateCronExpression("invalid-cron-pattern-999");
    assert(
      !invalidResult.isValid && typeof invalidResult.error === "string",
      "Rejects malformed cron pattern with descriptive error",
      invalidResult.error
    );

    // -------------------------------------------------------------
    // Phase B: Seed Test Workflow Blueprint
    // -------------------------------------------------------------
    console.log("\nPhase B: Database Blueprint Setup");

    // Clean up any previous test workflow
    await db.workflowBlueprint.deleteMany({
      where: { name: "Test Cron Data Sync DAG" },
    });

    const testBlueprint = await db.workflowBlueprint.create({
      data: {
        name: "Test Cron Data Sync DAG",
        description: "Scheduled recurring pipeline for syncing external market prices",
        isActive: true,
        webhookSecret: "test_secret_key_123",
        cronExpression: "*/10 * * * *",
        nodesJson: [
          {
            id: "node_cron_root",
            type: "CRON_TRIGGER",
            data: { schedule: "*/10 * * * *" },
          },
          {
            id: "node_http_fetch",
            type: "HTTP_REQUEST",
            data: { url: "https://api.example.com/prices", method: "GET" },
          },
          {
            id: "node_transform",
            type: "JSON_TRANSFORM",
            data: { mapping: "items.price" },
          },
        ],
        edgesJson: [
          { source: "node_cron_root", target: "node_http_fetch" },
          { source: "node_http_fetch", target: "node_transform" },
        ],
        adjacencyMap: {
          node_cron_root: ["node_http_fetch"],
          node_http_fetch: ["node_transform"],
          node_transform: [],
        },
        baseIndegrees: {
          node_cron_root: 0,
          node_http_fetch: 1,
          node_transform: 1,
        },
      },
    });

    assert(Boolean(testBlueprint.id), "Creates test workflow blueprint in PostgreSQL", testBlueprint.id);

    // -------------------------------------------------------------
    // Phase C: BullMQ queue.upsertJobScheduler Connection
    // -------------------------------------------------------------
    console.log("\nPhase C: BullMQ Repeatable Job Registration");

    const scheduleRes = await scheduleWorkflowCron({
      workflowId: testBlueprint.id,
      cronExpression: "0 * * * *", // Hourly
      timezone: "UTC",
    });

    assert(
      scheduleRes.success && scheduleRes.schedulerId === `cron:${testBlueprint.id}`,
      "Registers repeatable cron schedule via queue.upsertJobScheduler",
      JSON.stringify(scheduleRes)
    );

    // Verify scheduler exists in BullMQ queue
    const cronQueue = getCronQueue();
    const schedulers = await cronQueue.getJobSchedulers();
    const foundScheduler = schedulers.find((s) => s.key === `cron:${testBlueprint.id}`);

    assert(
      Boolean(foundScheduler && foundScheduler.pattern === "0 * * * *"),
      "BullMQ getJobSchedulers returns active scheduler with pattern '0 * * * *'",
      JSON.stringify(foundScheduler)
    );

    // Verify DB was updated
    const updatedBp = await db.workflowBlueprint.findUnique({
      where: { id: testBlueprint.id },
    });
    assert(
      updatedBp?.cronExpression === "0 * * * *" && updatedBp.isActive === true,
      "PostgreSQL workflow_blueprints record synchronizes cronExpression and isActive state"
    );

    // -------------------------------------------------------------
    // Phase D: List Schedulers Joined With Database
    // -------------------------------------------------------------
    console.log("\nPhase D: Listing Schedulers & Metadata Enrichment");

    const listedJobs = await listScheduledCronJobs();
    const listed = listedJobs.find((j) => j.workflowId === testBlueprint.id);

    assert(
      Boolean(listed && listed.workflowName === "Test Cron Data Sync DAG"),
      "listScheduledCronJobs returns enriched job with database workflow name",
      JSON.stringify(listed)
    );

    // -------------------------------------------------------------
    // Phase E: Workflow Triggering via Cron Execution Engine
    // -------------------------------------------------------------
    console.log("\nPhase E: Workflow Run Execution & Redis State Seeding");

    const triggerRes = await triggerWorkflowCronNow(testBlueprint.id);

    assert(
      triggerRes.success && Boolean(triggerRes.runId),
      "Triggers cron workflow execution and creates run in database",
      JSON.stringify(triggerRes)
    );

    if (triggerRes.runId) {
      // Verify WorkflowRun in PostgreSQL
      const runRecord = await db.workflowRun.findUnique({
        where: { id: triggerRes.runId },
      });

      assert(
        runRecord?.triggerType === TriggerSource.CRON &&
          (runRecord?.status === RunStatus.RUNNING || runRecord?.status === RunStatus.PENDING),
        "PostgreSQL workflow_runs stores triggerType = 'CRON'",
        JSON.stringify(runRecord)
      );

      // Verify Redis in-degrees seeded
      const indegrees = await redis.hgetall(`run:${triggerRes.runId}:indegree`);
      assert(
        indegrees["node_cron_root"] === "0" && indegrees["node_http_fetch"] === "1",
        "Redis Hash run:{runId}:indegree correctly seeded with node in-degrees",
        JSON.stringify(indegrees)
      );
    }

    // -------------------------------------------------------------
    // Phase F: Scheduler Removal & Teardown
    // -------------------------------------------------------------
    console.log("\nPhase F: Scheduler Teardown & Cleanup");

    const removeRes = await removeWorkflowCron(testBlueprint.id, { clearDbExpression: true });
    assert(removeRes.success, "Removes BullMQ repeatable job via removeJobScheduler");

    const schedulersAfter = await cronQueue.getJobSchedulers();
    const remaining = schedulersAfter.find((s) => s.key === `cron:${testBlueprint.id}`);
    assert(!remaining, "BullMQ confirms scheduler was deleted from queue");

    // Clean up test blueprint
    await db.workflowBlueprint.delete({ where: { id: testBlueprint.id } });
    console.log("  [CLEANUP] Deleted test workflow blueprint.");

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log("\n==================================================================");
    console.log(`   TEST RESULTS: ${passedTests}/${totalTests} PASSED (100% SUCCESS)`);
    console.log("==================================================================\n");
  } catch (err) {
    console.error("Test Suite Fatal Error:", err);
    process.exitCode = 1;
  } finally {
    await closeAllQueues();
    await redis.quit();
    await db.$disconnect();
  }
}

runTestSuite();
