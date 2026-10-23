import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {
    deadLetterJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workflowRun: {
      update: vi.fn(),
    },
    nodeExecutionLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((ops) => Promise.all(ops)),
  },
}));

vi.mock("@/lib/redis/client", () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(1),
  },
}));

const mockAdd = vi.fn().mockResolvedValue({ id: "bullmq_job_123" });
vi.mock("@/lib/queue/bullmq", () => ({
  getDagExecutionQueue: vi.fn(() => ({
    add: mockAdd,
  })),
}));

import { db } from "@/lib/db";
import { redis } from "@/lib/redis/client";

describe("POST /api/v1/dlq/[jobId]/replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 if jobId is not a valid UUID", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/dlq/invalid-id/replay", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ jobId: "invalid-id" }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("UUID format");
  });

  it("returns 404 if DLQ job is not found in database", async () => {
    vi.mocked(db.deadLetterJob.findUnique).mockResolvedValue(null);

    const validUuid = "11111111-2222-3333-4444-555555555555";
    const req = new NextRequest(`http://localhost:3000/api/v1/dlq/${validUuid}/replay`, {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ jobId: validUuid }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("successfully replays job, marks replayed, and enqueues to BullMQ", async () => {
    const jobId = "11111111-2222-3333-4444-555555555555";
    const runId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const workflowId = "99999999-8888-7777-6666-555555555555";
    const nodeId = "http_charge_stripe";

    vi.mocked(db.deadLetterJob.findUnique).mockResolvedValue({
      id: jobId,
      runId,
      workflowId,
      nodeId,
      failedPayload: { amount: 500 },
      lastError: "HTTP 503 Service Unavailable",
      attemptsMade: 3,
      replayed: false,
      failedAt: new Date(),
      run: {
        id: runId,
        workflowId,
        status: "FAILED",
        triggerType: "WEBHOOK",
        triggerPayload: {},
        startedAt: new Date(),
        completedAt: null,
        workflow: {
          id: workflowId,
          name: "Payment DAG",
          description: null,
          isActive: true,
          webhookSecret: "secret",
          cronExpression: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          nodesJson: [{ id: nodeId, type: "HTTP_REQUEST", data: { url: "https://api.stripe.com" } }],
          edgesJson: [],
          adjacencyMap: { [nodeId]: ["next_node"] },
          baseIndegrees: { [nodeId]: 0, next_node: 1 },
        },
      },
    } as any);

    const req = new NextRequest(`http://localhost:3000/api/v1/dlq/${jobId}/replay`, {
      method: "POST",
      body: JSON.stringify({ payloadOverride: { amount: 600 } }),
    });

    const res = await POST(req, { params: Promise.resolve({ jobId }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.replayedJobId).toBe(jobId);
    expect(json.attempt).toBe(4);
    expect(json.bullmqJobId).toBe("bullmq_job_123");

    // Verify BullMQ enqueue
    expect(mockAdd).toHaveBeenCalledWith(
      `exec:${nodeId}`,
      expect.objectContaining({
        runId,
        workflowId,
        nodeId,
        attempt: 4,
        isReplay: true,
        triggerPayload: { amount: 600 },
      }),
      expect.objectContaining({
        jobId: `job_${runId}_${nodeId}_4`,
      })
    );

    // Verify Redis Telemetry publish
    expect(redis.publish).toHaveBeenCalledWith(
      `channel:run:${runId}`,
      expect.stringContaining("DLQ_JOB_REPLAYED")
    );
  });
});
