import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedAllWorkflows, PRESEEDED_TEMPLATES } from "./seed-workflows";

describe("T6.1: Pre-Seeded Demo Workflows", () => {
  let mockDb: any;
  let mockScheduler: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      workflowBlueprint: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };

    mockScheduler = vi.fn().mockResolvedValue({
      success: true,
      schedulerId: "cron:test-cron-id",
    });
  });

  it("exports valid configurations for all 3 demo workflows", () => {
    expect(PRESEEDED_TEMPLATES.DIAMOND.name).toBe("Diamond Payment Settlement");
    expect(PRESEEDED_TEMPLATES.DIAMOND.baseIndegrees.node_webhook).toBe(0);
    expect(PRESEEDED_TEMPLATES.DIAMOND.baseIndegrees.node_stripe).toBe(2);
    expect(PRESEEDED_TEMPLATES.DIAMOND.edgesJson).toHaveLength(4);

    expect(PRESEEDED_TEMPLATES.CHAOS.name).toBe("Chaos Flaky API Pipeline");
    expect(PRESEEDED_TEMPLATES.CHAOS.edgesJson).toHaveLength(1);

    expect(PRESEEDED_TEMPLATES.CRON.name).toBe("Cron Data Sync Pipeline");
    expect(PRESEEDED_TEMPLATES.CRON.cronExpression).toBe("*/5 * * * *");
    expect(PRESEEDED_TEMPLATES.CRON.edgesJson).toHaveLength(2);
  });

  it("seeds 3 new blueprints into database and registers BullMQ cron scheduler", async () => {
    // None exist initially
    mockDb.workflowBlueprint.findFirst.mockResolvedValue(null);
    mockDb.workflowBlueprint.create.mockImplementation(({ data }: any) => {
      return Promise.resolve({
        id: `mock-id-${data.name.toLowerCase().replace(/[^a-z]/g, "-")}`,
        ...data,
      });
    });

    const result = await seedAllWorkflows({
      dbClient: mockDb,
      schedulerFn: mockScheduler,
      silent: true,
    });

    expect(mockDb.workflowBlueprint.create).toHaveBeenCalledTimes(3);

    // Verify Diamond DAG creation
    expect(result.diamond.name).toBe("Diamond Payment Settlement");
    expect(result.diamond.adjacencyMap.node_webhook).toContain("node_fraud");
    expect(result.diamond.adjacencyMap.node_webhook).toContain("node_inventory");
    expect(result.diamond.baseIndegrees.node_stripe).toBe(2);

    // Verify Chaos Flaky API Pipeline creation
    expect(result.chaos.name).toBe("Chaos Flaky API Pipeline");

    // Verify Cron Pipeline creation & BullMQ scheduling
    expect(result.cron.name).toBe("Cron Data Sync Pipeline");
    expect(mockScheduler).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: result.cron.id,
        cronExpression: "*/5 * * * *",
      })
    );
  });

  it("reuses existing blueprints idempotently without creating duplicates", async () => {
    const existingDiamond = { id: "existing-diamond-uuid", name: "Diamond Payment Settlement" };
    const existingChaos = { id: "existing-chaos-uuid", name: "Chaos Flaky API Pipeline" };
    const existingCron = {
      id: "existing-cron-uuid",
      name: "Cron Data Sync Pipeline",
      cronExpression: "*/5 * * * *",
    };

    mockDb.workflowBlueprint.findFirst
      .mockResolvedValueOnce(existingDiamond)
      .mockResolvedValueOnce(existingChaos)
      .mockResolvedValueOnce(existingCron);

    const result = await seedAllWorkflows({
      dbClient: mockDb,
      schedulerFn: mockScheduler,
      silent: true,
    });

    expect(mockDb.workflowBlueprint.create).not.toHaveBeenCalled();
    expect(result.diamond.id).toBe("existing-diamond-uuid");
    expect(result.chaos.id).toBe("existing-chaos-uuid");
    expect(result.cron.id).toBe("existing-cron-uuid");
    expect(mockScheduler).toHaveBeenCalledTimes(1);
  });
});
