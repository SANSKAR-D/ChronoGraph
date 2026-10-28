import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/v1/dlq/purge
 * Robust POST endpoint to purge dead-letter jobs from PostgreSQL.
 */
export async function POST(request: Request) {
  try {
    let replayedOnly = false;
    try {
      const { searchParams } = new URL(request.url);
      replayedOnly = searchParams.get("replayedOnly") === "true";
      const body = await request.json().catch(() => ({}));
      if (body?.replayedOnly) replayedOnly = true;
    } catch {
      // ignore parsing error
    }

    const where = replayedOnly ? { replayed: true } : {};
    const result = await db.deadLetterJob.deleteMany({ where });

    return NextResponse.json({
      success: true,
      message: replayedOnly
        ? `Cleared ${result.count} replayed DLQ jobs.`
        : `Purged all ${result.count} DLQ jobs.`,
      deletedCount: result.count,
    });
  } catch (error: any) {
    console.error("[DLQ Purge] Failed to purge DLQ records:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to purge DLQ records" },
      { status: 500 }
    );
  }
}
