import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, DELETE } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  db: {
    workflowBlueprint: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/cron/scheduler", () => ({
  removeWorkflowCron: vi.fn().mockResolvedValue({ success: true }),
  removeRepeatableJobScheduler: vi.fn().mockResolvedValue({ success: true }),
}));

import { db } from "@/lib/db";

describe("Workflows API: GET and POST /api/v1/workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/v1/workflows returns list of workflow blueprints", async () => {
    const mockBlueprints = [
      {
        id: "wf-1",
        name: "Diamond Payment Settlement",
        description: "Payment pipeline",
        isActive: true,
        cronExpression: null,
        nodesJson: [{ id: "n1" }],
        edgesJson: [],
      },
      {
        id: "wf-2",
        name: "Cron Data Sync Pipeline",
        description: "Recurring sync",
        isActive: true,
        cronExpression: "*/5 * * * *",
        nodesJson: [{ id: "n2" }],
        edgesJson: [],
      },
    ];

    vi.mocked(db.workflowBlueprint.findMany).mockResolvedValueOnce(mockBlueprints as any);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(data.workflows).toHaveLength(2);
    expect(data.workflows[0].name).toBe("Diamond Payment Settlement");
  });

  it("POST /api/v1/workflows rejects missing name with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/workflows", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/name is required/i);
  });

  it("POST /api/v1/workflows rejects cyclic DAGs with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/workflows", {
      method: "POST",
      body: JSON.stringify({
        name: "Cyclic Flow",
        nodes: [{ id: "node_a" }, { id: "node_b" }],
        connections: [
          { from: "node_a", to: "node_b" },
          { from: "node_b", to: "node_a" },
        ],
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/cycle detected/i);
    expect(db.workflowBlueprint.create).not.toHaveBeenCalled();
  });

  it("POST /api/v1/workflows successfully saves a valid DAG with topology maps", async () => {
    const createdWf = {
      id: "wf-uuid-1234",
      name: "Custom Data Ingestion",
      description: "ETL flow",
      isActive: true,
      nodesJson: [{ id: "node_start" }, { id: "node_end" }],
      edgesJson: [{ source: "node_start", target: "node_end" }],
      adjacencyMap: { node_start: ["node_end"], node_end: [] },
      baseIndegrees: { node_start: 0, node_end: 1 },
    };

    vi.mocked(db.workflowBlueprint.create).mockResolvedValueOnce(createdWf as any);

    const req = new NextRequest("http://localhost:3000/api/v1/workflows", {
      method: "POST",
      body: JSON.stringify({
        name: "Custom Data Ingestion",
        description: "ETL flow",
        nodes: [{ id: "node_start", name: "Start" }, { id: "node_end", name: "End" }],
        connections: [{ from: "node_start", to: "node_end" }],
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.workflow.id).toBe("wf-uuid-1234");
    expect(db.workflowBlueprint.create).toHaveBeenCalledTimes(1);

    const createArg = vi.mocked(db.workflowBlueprint.create).mock.calls[0][0];
    expect(createArg.data.name).toBe("Custom Data Ingestion");
    expect(createArg.data.adjacencyMap).toEqual({ node_start: ["node_end"], node_end: [] });
    expect(createArg.data.baseIndegrees).toEqual({ node_start: 0, node_end: 1 });
  });

  it("DELETE /api/v1/workflows deletes a workflow blueprint by query param", async () => {
    vi.mocked(db.workflowBlueprint.findUnique).mockResolvedValueOnce({
      id: "wf-to-delete",
      name: "Old Flow",
    } as any);
    vi.mocked(db.workflowBlueprint.delete).mockResolvedValueOnce({
      id: "wf-to-delete",
    } as any);

    const req = new NextRequest("http://localhost:3000/api/v1/workflows?id=wf-to-delete", {
      method: "DELETE",
    });

    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/deleted successfully/i);
    expect(db.workflowBlueprint.delete).toHaveBeenCalledWith({
      where: { id: "wf-to-delete" },
    });
  });

  it("DELETE /api/v1/workflows returns 404 when workflow does not exist", async () => {
    vi.mocked(db.workflowBlueprint.findUnique).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/v1/workflows?id=wf-not-found", {
      method: "DELETE",
    });

    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
  });
});
