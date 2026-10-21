import { NextResponse } from "next/server";
import { syncAllActiveCronWorkflows } from "@/lib/cron/scheduler";

export async function POST() {
  try {
    const result = await syncAllActiveCronWorkflows();
    return NextResponse.json(
      {
        success: true,
        synced: result.synced,
        totalActive: result.totalActive,
        errors: result.errors,
        message: `Synchronized ${result.synced}/${result.totalActive} active cron workflows into BullMQ.`,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
