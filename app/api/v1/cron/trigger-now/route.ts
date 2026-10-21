import { NextRequest, NextResponse } from "next/server";
import { triggerWorkflowCronNow } from "@/lib/cron/scheduler";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflowId } = body;

    if (!workflowId || typeof workflowId !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'workflowId' is required." },
        { status: 400 }
      );
    }

    const result = await triggerWorkflowCronNow(workflowId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        runId: result.runId,
        workflowId: result.workflowId,
        workflowName: result.workflowName,
        rootNodeIds: result.rootNodeIds,
        message: `Workflow "${result.workflowName}" triggered successfully via Cron trigger runner.`,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
