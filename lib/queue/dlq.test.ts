import { describe, it, expect, vi } from "vitest";
import {
  findAllTransitiveDownstreamNodes,
  routeJobToDeadLetterQueue,
  handleWorkerJobFailure,
} from "./dlq";
import { NodeExecStatus, RunStatus } from "@prisma/client";

describe("T3.4: Dead-Letter Queue Routing Engine", () => {
  describe("findAllTransitiveDownstreamNodes", () => {
    it("finds all downstream nodes in a linear pipeline", () => {
      const adjacencyMap = {
        node_1: ["node_2"],
        node_2: ["node_3"],
        node_3: ["node_4"],
        node_4: [],
      };

      const downstream = findAllTransitiveDownstreamNodes(adjacencyMap, "node_2");
      expect(downstream).toEqual(["node_3", "node_4"]);
    });

    it("correctly traverses diamond convergence without duplicate entries", () => {
      // A -> [B, C] -> D -> E
      const adjacencyMap = {
        A: ["B", "C"],
        B: ["D"],
        C: ["D"],
        D: ["E"],
        E: [],
      };

      const fromA = findAllTransitiveDownstreamNodes(adjacencyMap, "A");
      expect(fromA).toHaveLength(4);
      expect(fromA).toContain("B");
      expect(fromA).toContain("C");
      expect(fromA).toContain("D");
      expect(fromA).toContain("E");

      const fromB = findAllTransitiveDownstreamNodes(adjacencyMap, "B");
      expect(fromB).toEqual(["D", "E"]);
    });

    it("returns an empty array for leaf nodes with no outgoing edges", () => {
      const adjacencyMap = {
        leaf: [],
      };
      expect(findAllTransitiveDownstreamNodes(adjacencyMap, "leaf")).toEqual([]);
    });
  });

  describe("handleWorkerJobFailure", () => {
    it("handles intermediate failure by logging RETRYING state and emitting telemetry", async () => {
      const runId = "e5a6a617-bb25-44cb-ae65-02558c704f01";
      const workflowId = "f4b88f64-5717-4562-b3fc-2c963f66afa7";
      const nodeId = "http_charge";

      const mockJob = {
        id: "bullmq_job_123",
        name: "exec:http_charge",
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: {
          runId,
          workflowId,
          nodeId,
          nodeData: { baseBackoffMs: 1000, maxBackoffCapMs: 10000 },
        },
      } as any;

      const mockError = new Error("HTTP 503 Service Unavailable");

      const mockDb = {
        nodeExecutionLog: {
          upsert: vi.fn().mockResolvedValue({ id: "log_1" }),
        },
        deadLetterJob: {
          create: vi.fn(),
        },
      };

      const mockRedis = {
        publish: vi.fn().mockResolvedValue(1),
      };

      const result = await handleWorkerJobFailure(mockJob, mockError, {
        dbClient: mockDb,
        redisClient: mockRedis,
      });

      expect(result.isExhausted).toBe(false);
      expect(result.attemptsMade).toBe(1);
      expect(result.maxAttempts).toBe(3);

      // Verify node log was recorded as RETRYING
      expect(mockDb.nodeExecutionLog.upsert).toHaveBeenCalledTimes(1);
      const logCall = mockDb.nodeExecutionLog.upsert.mock.calls[0][0];
      expect(logCall.create.status).toBe(NodeExecStatus.RETRYING);
      expect(logCall.create.attemptNumber).toBe(1);
      expect(logCall.create.errorMessage).toBe("HTTP 503 Service Unavailable");

      // Verify DLQ record was NOT created
      expect(mockDb.deadLetterJob.create).not.toHaveBeenCalled();

      // Verify RETRYING event was published to channel:run:${runId}
      expect(mockRedis.publish).toHaveBeenCalledWith(
        `channel:run:${runId}`,
        expect.stringContaining('"status":"RETRYING"')
      );
    });

    it("routes exhausted job to DLQ when attemptsMade >= attempts", async () => {
      const runId = "e5a6a617-bb25-44cb-ae65-02558c704f01";
      const workflowId = "f4b88f64-5717-4562-b3fc-2c963f66afa7";
      const nodeId = "http_charge";

      const mockJob = {
        id: "bullmq_job_456",
        name: "exec:http_charge",
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: {
          runId,
          workflowId,
          nodeId,
          adjacencyMap: {
            http_charge: ["send_receipt", "sync_analytics"],
            send_receipt: ["archive_order"],
            sync_analytics: [],
            archive_order: [],
          },
        },
      } as any;

      const mockError = new Error("Payment gateway connection reset (ECONNRESET)");

      const mockDb = {
        deadLetterJob: {
          create: vi.fn().mockResolvedValue({
            id: "dlq_record_999",
            failedAt: new Date("2026-10-23T12:00:00Z"),
          }),
        },
        nodeExecutionLog: {
          upsert: vi.fn().mockResolvedValue({ id: "log_upserted" }),
        },
        workflowRun: {
          update: vi.fn().mockResolvedValue({ id: runId }),
        },
        workflowBlueprint: {
          findUnique: vi.fn(),
        },
      };

      const mockRedis = {
        publish: vi.fn().mockResolvedValue(1),
      };

      const mockDlqQueue = {
        add: vi.fn().mockResolvedValue({ id: "dlq_job_id" }),
      };

      const result = await handleWorkerJobFailure(mockJob, mockError, {
        dbClient: mockDb,
        redisClient: mockRedis,
        dlqQueueClient: mockDlqQueue,
      });

      expect(result.isExhausted).toBe(true);
      expect(result.dlqRecordId).toBe("dlq_record_999");
      expect(result.attemptsMade).toBe(3);
      expect(result.maxAttempts).toBe(3);

      // Verify deadLetterJob record was persisted
      expect(mockDb.deadLetterJob.create).toHaveBeenCalledTimes(1);
      const dlqCreateCall = mockDb.deadLetterJob.create.mock.calls[0][0];
      expect(dlqCreateCall.data.runId).toBe(runId);
      expect(dlqCreateCall.data.workflowId).toBe(workflowId);
      expect(dlqCreateCall.data.nodeId).toBe(nodeId);
      expect(dlqCreateCall.data.lastError).toBe("Payment gateway connection reset (ECONNRESET)");
      expect(dlqCreateCall.data.attemptsMade).toBe(3);
      expect(dlqCreateCall.data.replayed).toBe(false);

      // Verify failed node was updated to status DLQ
      const dlqLogCall = mockDb.nodeExecutionLog.upsert.mock.calls[0][0];
      expect(dlqLogCall.create.status).toBe(NodeExecStatus.DLQ);
      expect(dlqLogCall.create.errorMessage).toBe("Payment gateway connection reset (ECONNRESET)");

      // Verify downstream nodes [send_receipt, sync_analytics, archive_order] were marked as SKIPPED/HALTED
      expect(result.haltedDownstreamNodes).toEqual(
        expect.arrayContaining(["send_receipt", "sync_analytics", "archive_order"])
      );
      expect(mockDb.nodeExecutionLog.upsert).toHaveBeenCalledTimes(4); // 1 for DLQ node + 3 for downstream halted nodes

      // Verify workflow run was transitioned to PARTIAL_FAILURE
      expect(mockDb.workflowRun.update).toHaveBeenCalledWith({
        where: { id: runId },
        data: expect.objectContaining({
          status: RunStatus.PARTIAL_FAILURE,
        }),
      });

      // Verify DLQ_ROUTED event was published across channels
      expect(mockRedis.publish).toHaveBeenCalledWith(
        `channel:run:${runId}`,
        expect.stringContaining('"event":"DLQ_ROUTED"')
      );
      expect(mockRedis.publish).toHaveBeenCalledWith(
        "channel:cluster:events",
        expect.stringContaining('"event":"DLQ_ROUTED"')
      );

      // Verify job was added to BullMQ dead-letter queue
      expect(mockDlqQueue.add).toHaveBeenCalledWith(
        `dlq:${nodeId}`,
        expect.objectContaining({
          dlqRecordId: "dlq_record_999",
          runId,
          workflowId,
          nodeId,
        }),
        expect.objectContaining({
          jobId: "dlq_dlq_record_999",
        })
      );
    });
  });

  describe("routeJobToDeadLetterQueue edge cases", () => {
    it("handles missing coordinates gracefully", async () => {
      const mockJob = {
        id: "invalid_job",
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: {},
      } as any;

      const result = await routeJobToDeadLetterQueue(mockJob, new Error("Crash"));
      expect(result.isExhausted).toBe(true);
      expect(result.error).toContain("Missing runId, workflowId, or nodeId");
    });
  });
});
