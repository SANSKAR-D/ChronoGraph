import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/v1/dlq
 * Returns the list of unresolved and archived dead-letter jobs from PostgreSQL.
 */
export async function GET() {
  try {
    const records = await db.deadLetterJob.findMany({
      orderBy: { failedAt: "desc" },
      take: 50,
      include: {
        run: {
          select: {
            workflow: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    const jobs = records.map((record) => {
      const payload = record.failedPayload as Record<string, any> | null;
      return {
        id: record.id,
        runId: record.runId,
        workflow: record.run?.workflow?.name || "DAG Workflow",
        failedNode: record.nodeId,
        attempts: record.attemptsMade,
        maxAttempts: payload?.maxAttempts || record.attemptsMade,
        lastError: record.lastError,
        timestamp: new Date(record.failedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        status: record.replayed ? "replayed" : "pending",
      };
    });

    return NextResponse.json({
      success: true,
      jobs,
      totalCount: jobs.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load DLQ records",
      },
      { status: 500 }
    );
  }
}
