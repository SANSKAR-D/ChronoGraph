import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, DELETE } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  db: {
    workflowBlueprint: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/cron/scheduler", () => ({
  removeWorkflowCron: vi.fn().mockResolvedValue({ success: true }),
  removeRepeatableJobScheduler: vi.fn().mockResolvedValue({ success: true }),
}));

import { db } from "@/lib/db";
import { removeWorkflowCron } from "@/lib/cron/scheduler";

const validUuid = "11111111-2222-4333-8444-555555555555";

describe("Single Workflow API: GET and DELETE /api/v1/workflows/[workflowId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 400 on invalid UUID format", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/workflows/not-a-uuid");
    const res = await GET(req, { params: Promise.resolve({ workflowId: "not-a-uuid" }) });
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("GET returns workflow by UUID", async () => {
    vi.mocked(db.workflowBlueprint.findUnique).mockResolvedValueOnce({
      id: validUuid,
      name: "Test Workflow",
    } as any);

    const req = new NextRequest(`http://localhost:3000/api/v1/workflows/${validUuid}`);
    const res = await GET(req, { params: Promise.resolve({ workflowId: validUuid }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.workflow.name).toBe("Test Workflow");
  });

  it("DELETE returns 404 when workflow not found", async () => {
    vi.mocked(db.workflowBlueprint.findUnique).mockResolvedValueOnce(null);

    const req = new NextRequest(`http://localhost:3000/api/v1/workflows/${validUuid}`, { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ workflowId: validUuid }) });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });

  it("DELETE successfully removes workflow and calls removeRepeatableJobScheduler", async () => {
    vi.mocked(db.workflowBlueprint.findUnique).mockResolvedValueOnce({
      id: validUuid,
      name: "To Delete",
    } as any);
    vi.mocked(db.workflowBlueprint.delete).mockResolvedValueOnce({
      id: validUuid,
    } as any);

    const req = new NextRequest(`http://localhost:3000/api/v1/workflows/${validUuid}`, { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ workflowId: validUuid }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(removeWorkflowCron).toHaveBeenCalledWith(validUuid);
    expect(db.workflowBlueprint.delete).toHaveBeenCalledWith({ where: { id: validUuid } });
  });
});
