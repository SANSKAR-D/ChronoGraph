import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, DELETE as bulkDELETE } from "./route";
import { DELETE as singleDELETE } from "./[jobId]/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  db: {
    deadLetterJob: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

describe("DLQ API: GET, DELETE and Diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/v1/dlq returns categorized failure reason and node endpoint", async () => {
    vi.mocked(db.deadLetterJob.findMany).mockResolvedValueOnce([
      {
        id: "11111111-2222-3333-4444-555555555555",
        runId: "22222222-3333-4444-5555-666666666666",
        workflowId: "33333333-4444-5555-6666-777777777777",
        nodeId: "node_stripe",
        attemptsMade: 3,
        lastError: "HTTP 429 (Too Many Requests): Request to [POST] https://httpbin.org/post failed",
        failedPayload: {
          jobData: {
            nodeData: { url: "https://httpbin.org/post", method: "POST" },
          },
        },
        replayed: false,
        failedAt: new Date("2026-10-28T08:00:00Z"),
        run: {
          workflow: {
            name: "Diamond Payment Settlement",
            nodesJson: [
              {
                id: "node_stripe",
                name: "Stripe Settlement",
                type: "HTTP_REQUEST",
                data: { url: "https://httpbin.org/post", method: "POST" },
              },
            ],
          },
        },
      } as any,
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.jobs).toHaveLength(1);

    expect(data.unresolvedCount).toBe(1);

    const job = data.jobs[0];
    expect(job.nodeName).toBe("Stripe Settlement");
    expect(job.targetUrl).toBe("https://httpbin.org/post");
    expect(job.targetMethod).toBe("POST");
    expect(job.errorCategory).toBe("HTTP 429 Rate Limited (Target Remote API)");
  });

  it("GET /api/v1/dlq returns 0 unresolvedCount and totalCount when DLQ is empty", async () => {
    vi.mocked(db.deadLetterJob.findMany).mockResolvedValueOnce([]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.totalCount).toBe(0);
    expect(data.unresolvedCount).toBe(0);
    expect(data.jobs).toHaveLength(0);
  });

  it("DELETE /api/v1/dlq purges all dead letter records", async () => {
    vi.mocked(db.deadLetterJob.deleteMany).mockResolvedValueOnce({ count: 5 });

    const req = new NextRequest("http://localhost:3000/api/v1/dlq", { method: "DELETE" });
    const res = await bulkDELETE(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deletedCount).toBe(5);
    expect(db.deadLetterJob.deleteMany).toHaveBeenCalledWith({ where: {} });
  });

  it("DELETE /api/v1/dlq/[jobId] deletes a single DLQ record by UUID", async () => {
    const validUuid = "11111111-2222-3333-4444-555555555555";
    vi.mocked(db.deadLetterJob.findUnique).mockResolvedValueOnce({ id: validUuid } as any);
    vi.mocked(db.deadLetterJob.delete).mockResolvedValueOnce({ id: validUuid } as any);

    const req = new NextRequest(`http://localhost:3000/api/v1/dlq/${validUuid}`, { method: "DELETE" });
    const res = await singleDELETE(req, { params: Promise.resolve({ jobId: validUuid }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deletedId).toBe(validUuid);
    expect(db.deadLetterJob.delete).toHaveBeenCalledWith({ where: { id: validUuid } });
  });

  it("DELETE /api/v1/dlq/[jobId] returns 400 on invalid UUID", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/dlq/not-a-uuid", { method: "DELETE" });
    const res = await singleDELETE(req, { params: Promise.resolve({ jobId: "not-a-uuid" }) });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });
});
