import { db } from "../lib/db";
import { scheduleWorkflowCron } from "../lib/cron/scheduler";

export async function seedCronDemoWorkflow() {
  console.log("Seeding Cron Data Sync Pipeline template...");

  // Check if already exists
  let workflow = await db.workflowBlueprint.findFirst({
    where: { name: "Cron Data Sync Pipeline" },
  });

  if (!workflow) {
    workflow = await db.workflowBlueprint.create({
      data: {
        name: "Cron Data Sync Pipeline",
        description: "Scheduled recurring pipeline: Ingests market ticker prices, maps JSON fields, and persists records.",
        isActive: true,
        webhookSecret: "chronograph_cron_sync_secret_2026",
        cronExpression: "*/5 * * * *", // Every 5 minutes
        nodesJson: [
          {
            id: "node_cron_trigger",
            name: "Cron Trigger",
            type: "CRON_TRIGGER",
            badge: "TRIGGER",
            detail: "Every 5 mins (*/5 * * * *)",
            data: { schedule: "*/5 * * * *" },
          },
          {
            id: "node_http_fetch",
            name: "Fetch Market Tickers",
            type: "HTTP_REQUEST",
            badge: "HTTP GET",
            detail: "GET /api/v1/mock/tickers",
            data: { url: "https://api.example.com/tickers", method: "GET" },
          },
          {
            id: "node_transform",
            name: "Remap JSON Payload",
            type: "JSON_TRANSFORM",
            badge: "TRANSFORM",
            detail: "Safe path remap {{items}}",
            data: { selector: "data.items" },
          },
          {
            id: "node_receipt",
            name: "Receipt ACK Sink",
            type: "SINK",
            badge: "COMPLETED",
            detail: "Save to audit log",
            data: {},
          },
        ],
        edgesJson: [
          { source: "node_cron_trigger", target: "node_http_fetch" },
          { source: "node_http_fetch", target: "node_transform" },
          { source: "node_transform", target: "node_receipt" },
        ],
        adjacencyMap: {
          node_cron_trigger: ["node_http_fetch"],
          node_http_fetch: ["node_transform"],
          node_transform: ["node_receipt"],
          node_receipt: [],
        },
        baseIndegrees: {
          node_cron_trigger: 0,
          node_http_fetch: 1,
          node_transform: 1,
          node_receipt: 1,
        },
      },
    });
    console.log("Created Cron Data Sync Pipeline workflow blueprint:", workflow.id);
  } else {
    console.log("Cron Data Sync Pipeline workflow already exists:", workflow.id);
  }

  // Register BullMQ repeatable scheduler
  const res = await scheduleWorkflowCron({
    workflowId: workflow.id,
    cronExpression: workflow.cronExpression || "*/5 * * * *",
    timezone: "UTC",
  });

  console.log("BullMQ Cron Scheduler registered:", res);
  return { workflow, scheduler: res };
}

if (require.main === module) {
  seedCronDemoWorkflow()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
