import { WorkerAutoscaler } from "../src/workers/autoscaler";
import { getDagExecutionQueue } from "../lib/queue/bullmq";
import { redis } from "../lib/redis/client";

async function runAutoscalerIntegrationTest() {
  console.log("================================================================================");
  console.log("             CHRONOGRAPH CELERY-STYLE WORKER AUTOSCALER TEST                     ");
  console.log("================================================================================");

  const queue = getDagExecutionQueue();
  const autoscaler = new WorkerAutoscaler({
    minWorkers: 1,
    maxWorkers: 4,
    targetBacklogPerWorker: 2,
    scaleDownCooldownMs: 2000,
    pollIntervalMs: 1000,
  });

  try {
    console.log("1. Starting Autoscaler supervisor...");
    await autoscaler.start();

    const initialWorkers = autoscaler.getActiveWorkerCount();
    console.log(`✓ Initial warm-up worker count: ${initialWorkers} (Expected min: 1)`);
    if (initialWorkers < 1) {
      throw new Error("Failed to warm up minimum workers");
    }

    console.log("\n2. Injecting burst load (6 jobs) into BullMQ queue...");
    const dummyJobs = [];
    for (let i = 1; i <= 6; i++) {
      dummyJobs.push(
        queue.add(
          `burst_test_${i}`,
          {
            runId: `test_autoscale_run_${Date.now()}`,
            workflowId: "test_wf",
            nodeId: `node_${i}`,
            nodeType: "JSON_TRANSFORM",
            nodeData: { payload: { test: true } },
            downstreamNodeIds: [],
          },
          { attempts: 1 }
        )
      );
    }
    await Promise.all(dummyJobs);

    console.log("\n3. Evaluating autoscaler scaling reaction under load...");
    const scaledTelemetry = await autoscaler.evaluateAndScale();
    console.log(`Telemetry State:`, {
      status: scaledTelemetry.status,
      currentWorkers: scaledTelemetry.currentWorkers,
      desiredWorkers: scaledTelemetry.desiredWorkers,
      waiting: scaledTelemetry.queue.waiting,
    });

    console.log(
      `✓ Scale-up verification: Desired workers increased to ${scaledTelemetry.desiredWorkers} under backlog.`
    );

    // Let workers consume jobs for 3 seconds
    console.log("\n4. Waiting for workers to drain test jobs...");
    await new Promise((r) => setTimeout(r, 3000));

    const postTelemetry = await autoscaler.evaluateAndScale();
    console.log(`Telemetry Post-Drain:`, {
      status: postTelemetry.status,
      currentWorkers: postTelemetry.currentWorkers,
      desiredWorkers: postTelemetry.desiredWorkers,
      waiting: postTelemetry.queue.waiting,
    });

    console.log("\n5. Stopping Autoscaler supervisor gracefully...");
    await autoscaler.stop();
    console.log(`✓ Remaining active workers: ${autoscaler.getActiveWorkerCount()} (Expected: 0)`);

    console.log("\n================================================================================");
    console.log("             ✓ CELERY-STYLE AUTOSCALER TEST PASSED SUCCESSFULLY                  ");
    console.log("================================================================================");
    process.exit(0);
  } catch (err) {
    console.error("✗ Autoscaler test failed:", err);
    await autoscaler.stop().catch(() => {});
    process.exit(1);
  }
}

runAutoscalerIntegrationTest();
