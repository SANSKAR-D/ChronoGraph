import { NextRequest, NextResponse } from "next/server";
import { removeWorkflowCron } from "@/lib/cron/scheduler";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflowId, clearDbExpression } = body;

    if (!workflowId || typeof workflowId !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'workflowId' is required." },
        { status: 400 }
      );
    }

    const result = await removeWorkflowCron(workflowId, {
      clearDbExpression: clearDbExpression !== false,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        schedulerId: result.schedulerId,
        workflowId,
        message: `BullMQ repeatable job scheduler removed successfully for workflow ${workflowId}.`,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
