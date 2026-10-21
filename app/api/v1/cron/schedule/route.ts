import { NextRequest, NextResponse } from "next/server";
import { scheduleWorkflowCron, validateCronExpression } from "@/lib/cron/scheduler";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflowId, cronExpression, timezone, immediately } = body;

    if (!workflowId || typeof workflowId !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'workflowId' (UUID string) is required." },
        { status: 400 }
      );
    }

    if (!cronExpression || typeof cronExpression !== "string") {
      return NextResponse.json(
        { success: false, error: "Field 'cronExpression' (string) is required." },
        { status: 400 }
      );
    }

    // Pre-validate cron expression
    const validation = validateCronExpression(cronExpression, { tz: timezone });
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 422 }
      );
    }

    // Connect and upsert BullMQ repeatable scheduler
    const result = await scheduleWorkflowCron({
      workflowId,
      cronExpression,
      timezone,
      immediately: Boolean(immediately),
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
        cronExpression,
        nextRunAt: result.nextRunAt,
        message: `BullMQ repeatable job scheduled successfully for workflow ${workflowId}.`,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
