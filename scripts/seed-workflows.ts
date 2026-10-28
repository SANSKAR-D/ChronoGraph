import { db as defaultDb } from "../lib/db";
import { scheduleWorkflowCron as defaultScheduleWorkflowCron } from "../lib/cron/scheduler";

// Automatically load local .env if available
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(process.cwd());
} catch {
  // Ignore when environment variables are already populated or in tests
}

export interface SeedWorkflowOptions {
  dbClient?: any;
  schedulerFn?: typeof defaultScheduleWorkflowCron;
  silent?: boolean;
}

export const PRESEEDED_TEMPLATES = {
  DIAMOND: {
    name: "Diamond Payment Settlement",
    description: "Diamond DAG pipeline: Webhook -> Fraud Check & Inventory Reservation -> Stripe Charge -> Audit Receipt",
    isActive: true,
    webhookSecret: "chronograph_webhook_secret_2026",
    cronExpression: null,
    nodesJson: [
      {
        id: "node_webhook",
        name: "Webhook Ingestion",
        type: "WEBHOOK_TRIGGER",
        badge: "TRIGGER",
        detail: "POST /api/v1/hooks/orders_settle",
        data: { endpoint: "orders_settle" },
      },
      {
        id: "node_fraud",
        name: "Fraud Risk Scoring",
        type: "HTTP_REQUEST",
        badge: "HTTP GET",
        detail: "GET https://api.sift.com/v1/score",
        data: { url: "https://httpbin.org/get", method: "GET" },
      },
      {
        id: "node_inventory",
        name: "Reserve Stock",
        type: "JSON_TRANSFORM",
        badge: "TRANSFORM",
        detail: "payload.items.map(i => i.sku)",
        data: { selector: "items" },
      },
      {
        id: "node_stripe",
        name: "Stripe Settlement",
        type: "HTTP_REQUEST",
        badge: "HTTP POST",
        detail: "POST https://api.stripe.com/v1/charges",
        data: { url: "https://httpbin.org/post", method: "POST" },
      },
    ],
    edgesJson: [
      { source: "node_webhook", target: "node_fraud" },
      { source: "node_webhook", target: "node_inventory" },
      { source: "node_fraud", target: "node_stripe" },
      { source: "node_inventory", target: "node_stripe" },
    ],
    adjacencyMap: {
      node_webhook: ["node_fraud", "node_inventory"],
      node_fraud: ["node_stripe"],
      node_inventory: ["node_stripe"],
      node_stripe: [],
    },
    baseIndegrees: {
      node_webhook: 0,
      node_fraud: 1,
      node_inventory: 1,
      node_stripe: 2,
    },
  },
  CHAOS: {
    name: "Chaos Flaky API Pipeline",
    description: "Simulates transient network timeouts, exponential backoff with full jitter, and dead-letter routing.",
    isActive: true,
    webhookSecret: "chronograph_chaos_secret_2026",
    cronExpression: null,
    nodesJson: [
      {
        id: "node_chaos_trigger",
        name: "Webhook Ingestion",
        type: "WEBHOOK_TRIGGER",
        badge: "TRIGGER",
        detail: "POST /api/v1/hooks/chaos_flaky",
        data: { endpoint: "chaos_flaky" },
      },
      {
        id: "node_flaky_http",
        name: "Unreliable Gateway",
        type: "HTTP_REQUEST",
        badge: "HTTP POST",
        detail: "POST /api/v1/mock/flaky (503 Gateway)",
        data: { url: "https://httpbin.org/status/503", method: "POST", maxRetries: 3 },
      },
    ],
    edgesJson: [
      { source: "node_chaos_trigger", target: "node_flaky_http" },
    ],
    adjacencyMap: {
      node_chaos_trigger: ["node_flaky_http"],
      node_flaky_http: [],
    },
    baseIndegrees: {
      node_chaos_trigger: 0,
      node_flaky_http: 1,
    },
  },
  CRON: {
    name: "Cron Data Sync Pipeline",
    description: "Scheduled recurring pipeline: Ingests market ticker prices, maps JSON fields, and persists records.",
    isActive: true,
    webhookSecret: "chronograph_cron_sync_secret_2026",
    cronExpression: "*/5 * * * *",
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
        data: { url: "https://httpbin.org/get", method: "GET" },
      },
      {
        id: "node_transform",
        name: "Remap JSON Payload",
        type: "JSON_TRANSFORM",
        badge: "TRANSFORM",
        detail: "Safe path remap {{items}}",
        data: { selector: "items" },
      },
    ],
    edgesJson: [
      { source: "node_cron_trigger", target: "node_http_fetch" },
      { source: "node_http_fetch", target: "node_transform" },
    ],
    adjacencyMap: {
      node_cron_trigger: ["node_http_fetch"],
      node_http_fetch: ["node_transform"],
      node_transform: [],
    },
    baseIndegrees: {
      node_cron_trigger: 0,
      node_http_fetch: 1,
      node_transform: 1,
    },
  },
};

export async function seedAllWorkflows(options?: SeedWorkflowOptions) {
  const dbClient = options?.dbClient ?? defaultDb;
  const schedulerFn = options?.schedulerFn ?? defaultScheduleWorkflowCron;
  const log = options?.silent ? () => {} : console.log;
  const warn = options?.silent ? () => {} : console.warn;

  log("Seeding standard ChronoGraph workflow blueprints...");

  // 1. Diamond Payment Settlement DAG
  let diamond = await dbClient.workflowBlueprint.findFirst({
    where: {
      OR: [
        { name: PRESEEDED_TEMPLATES.DIAMOND.name },
        { name: "orders_settle" },
      ],
    },
  });

  if (!diamond) {
    diamond = await dbClient.workflowBlueprint.create({
      data: PRESEEDED_TEMPLATES.DIAMOND,
    });
    log("Created Diamond Payment Settlement blueprint:", diamond.id);
  } else {
    log("Diamond Payment Settlement blueprint already exists:", diamond.id);
  }

  // 2. Chaos Flaky API Pipeline
  let chaos = await dbClient.workflowBlueprint.findFirst({
    where: { name: PRESEEDED_TEMPLATES.CHAOS.name },
  });

  if (!chaos) {
    chaos = await dbClient.workflowBlueprint.create({
      data: PRESEEDED_TEMPLATES.CHAOS,
    });
    log("Created Chaos Flaky API Pipeline blueprint:", chaos.id);
  } else {
    log("Chaos Flaky API Pipeline blueprint already exists:", chaos.id);
  }

  // 3. Cron Data Sync Pipeline
  let cron = await dbClient.workflowBlueprint.findFirst({
    where: { name: PRESEEDED_TEMPLATES.CRON.name },
  });

  if (!cron) {
    cron = await dbClient.workflowBlueprint.create({
      data: PRESEEDED_TEMPLATES.CRON,
    });
    log("Created Cron Data Sync Pipeline blueprint:", cron.id);
  } else {
    log("Cron Data Sync Pipeline blueprint already exists:", cron.id);
  }

  // Register repeatable cron scheduler in BullMQ
  try {
    await schedulerFn({
      workflowId: cron.id,
      cronExpression: cron.cronExpression || "*/5 * * * *",
      timezone: "UTC",
    });
    log("Cron scheduler successfully registered in BullMQ!");
  } catch (err) {
    warn("Cron scheduler warning:", err);
  }

  return { diamond, chaos, cron };
}

if (require.main === module) {
  seedAllWorkflows()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
