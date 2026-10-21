import { NextResponse } from "next/server";
import { listScheduledCronJobs } from "@/lib/cron/scheduler";

export async function GET() {
  try {
    const schedulers = await listScheduledCronJobs();
    return NextResponse.json(
      {
        success: true,
        count: schedulers.length,
        schedulers,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
