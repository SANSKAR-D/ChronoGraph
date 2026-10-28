import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateDAG } from "@/lib/dag/cycle-detector";
import { removeWorkflowCron } from "@/lib/cron/scheduler";
import crypto from "crypto";

/**
 * GET /api/v1/workflows
 * Returns all saved workflow blueprints from the database.
 */
export async function GET() {
  try {
    const workflows = await db.workflowBlueprint.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        cronExpression: true,
        nodesJson: true,
        edgesJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      workflows,
      count: workflows.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load workflow blueprints",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/workflows
 * Creates and persists a new workflow blueprint with name, DAG validation, and topology maps.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, nodes = [], connections = [] } = body;

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return NextResponse.json(
        { success: false, error: "Workflow name is required." },
        { status: 400 }
      );
    }

    // 1. Convert nodes & connections to DAG structures and validate for cycles
    const dagNodes = Array.isArray(nodes)
      ? nodes.map((n: any) => ({ id: String(n.id) }))
      : [];

    const dagEdges = Array.isArray(connections)
      ? connections.map((c: any, idx: number) => ({
          id: `e_${idx}`,
          source: String(c.from || c.source),
          target: String(c.to || c.target),
        }))
      : [];

    const validation = validateDAG(dagNodes, dagEdges);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error || "Cannot save workflow: cycle detected in DAG.",
          cyclePath: validation.cyclePath,
        },
        { status: 400 }
      );
    }

    // 2. Detect any cron expression from cron trigger nodes
    const cronNode = Array.isArray(nodes)
      ? nodes.find(
          (n: any) =>
            n.type === "cron_trigger" ||
            n.type === "CRON_TRIGGER" ||
            n.category === "cron"
        )
      : null;

    const cronExpression =
      cronNode?.config?.cronExpression ||
      cronNode?.data?.schedule ||
      (cronNode?.detail?.includes("(")
        ? cronNode.detail.match(/\(([^)]+)\)/)?.[1]
        : null) ||
      null;

    const webhookSecret = `whsec_${crypto.randomBytes(16).toString("hex")}`;

    // 3. Persist new WorkflowBlueprint in PostgreSQL
    const workflow = await db.workflowBlueprint.create({
      data: {
        name: trimmedName,
        description: typeof description === "string" ? description.trim() : null,
        isActive: true,
        webhookSecret,
        cronExpression,
        nodesJson: nodes,
        edgesJson: dagEdges,
        adjacencyMap: validation.adjacencyMap,
        baseIndegrees: validation.baseIndegrees,
      },
    });

    return NextResponse.json(
      {
        success: true,
        workflow,
        message: `Workflow "${workflow.name}" saved successfully.`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create workflow blueprint",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/workflows?id=<workflowId>
 * Deletes a workflow by query parameter or request body.
 */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const idFromQuery = url.searchParams.get("id");
    let idFromBody: string | undefined;
    try {
      const b = await req.json();
      idFromBody = b?.id;
    } catch {}

    const workflowId = idFromQuery || idFromBody;
    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: "Workflow ID is required for deletion." },
        { status: 400 }
      );
    }

    const blueprint = await db.workflowBlueprint.findUnique({
      where: { id: workflowId },
    });

    if (!blueprint) {
      return NextResponse.json(
        { success: false, error: `Workflow '${workflowId}' not found.` },
        { status: 404 }
      );
    }

    try {
      await removeWorkflowCron(workflowId);
    } catch {}

    await db.workflowBlueprint.delete({ where: { id: workflowId } });

    return NextResponse.json({
      success: true,
      message: `Workflow "${blueprint.name}" deleted successfully.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete workflow." },
      { status: 500 }
    );
  }
}

