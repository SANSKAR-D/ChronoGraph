import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { removeWorkflowCron } from "@/lib/cron/scheduler";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/workflows/[workflowId]
 * Fetches a single workflow blueprint by UUID.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await params;
    if (!workflowId || !UUID_REGEX.test(workflowId)) {
      return NextResponse.json(
        { success: false, error: "Invalid workflow UUID format." },
        { status: 400 }
      );
    }

    const workflow = await db.workflowBlueprint.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow '${workflowId}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, workflow });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch workflow." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/workflows/[workflowId]
 * Deletes a workflow blueprint and cleanly removes any BullMQ repeatable schedules.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await params;
    if (!workflowId || !UUID_REGEX.test(workflowId)) {
      return NextResponse.json(
        { success: false, error: "Invalid workflow UUID format." },
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

    // 1. Unregister BullMQ repeatable cron scheduler if one exists
    try {
      await removeWorkflowCron(workflowId);
    } catch (schedErr) {
      console.warn(`[Workflows] Error unregistering BullMQ schedule for ${workflowId}:`, schedErr);
    }

    // 2. Cascade delete workflow and all runs/logs from PostgreSQL
    await db.workflowBlueprint.delete({
      where: { id: workflowId },
    });

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

/**
 * POST /api/v1/workflows/[workflowId]
 * Compatibility fallback for HTTP clients or forms tunneling DELETE via POST.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ workflowId: string }> }
) {
  return DELETE(req, context);
}
