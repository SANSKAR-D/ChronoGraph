import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

/**
 * GET /api/v1/dlq
 * Returns the list of dead-letter jobs with rich context (target URLs, error categories, payloads).
 */
export async function GET(req?: NextRequest) {
  try {
    const session = getSessionUser(req);
    const userEmail = session?.email;

    let records: any[] = [];
    const includeConfig = {
      run: {
        select: {
          workflow: {
            select: {
              name: true,
              nodesJson: true,
            },
          },
        },
      },
    };

    try {
      records = await db.deadLetterJob.findMany({
        where: userEmail
          ? { OR: [{ userEmail }, { run: { workflow: { userEmail } } }, { userEmail: null }] }
          : undefined,
        orderBy: { failedAt: "desc" },
        take: 100,
        include: includeConfig,
      });
    } catch {
      // Safe fallback if Prisma client schema lacks userEmail parameter
      records = await db.deadLetterJob.findMany({
        orderBy: { failedAt: "desc" },
        take: 100,
        include: includeConfig,
      });
      if (userEmail) {
        records = records.filter(
          (r: any) =>
            !r.userEmail ||
            r.userEmail === userEmail ||
            !r.run?.workflow?.userEmail ||
            r.run?.workflow?.userEmail === userEmail
        );
      }
    }

    const jobs = records.map((record) => {
      const payload = record.failedPayload as Record<string, any> | null;
      const nodes = (record.run?.workflow?.nodesJson as any[]) || [];
      const nodeDef = nodes.find((n) => n.id === record.nodeId);
      const nodeName = nodeDef?.name || record.nodeId;
      const nodeType = nodeDef?.type || payload?.jobData?.nodeType || "ACTION";
      const targetUrl =
        (nodeDef?.data?.url as string) ||
        (nodeDef?.data?.endpoint as string) ||
        (payload?.jobData?.nodeData?.url as string) ||
        null;
      const targetMethod =
        (nodeDef?.data?.method as string) ||
        (payload?.jobData?.nodeData?.method as string) ||
        null;

      // Classify the failure reason cleanly
      let errorCategory = "Execution Error";
      const errStr = record.lastError || "";
      if (errStr.includes("429")) {
        errorCategory = "HTTP 429 Rate Limited (Target Remote API)";
      } else if (errStr.includes("503") || errStr.includes("502") || errStr.includes("500")) {
        errorCategory = "Remote Gateway / HTTP 5xx Failure";
      } else if (errStr.includes("timed out") || errStr.includes("timeout")) {
        errorCategory = "Network Timeout (>10s elapsed)";
      } else if (errStr.includes("fetch failed") || errStr.includes("ECONNREFUSED")) {
        errorCategory = "Connection Dropped / Network Failure";
      }

      return {
        id: record.id,
        runId: record.runId,
        workflow: record.run?.workflow?.name || "DAG Workflow",
        failedNode: record.nodeId,
        nodeName,
        nodeType,
        targetUrl,
        targetMethod,
        errorCategory,
        attempts: record.attemptsMade,
        maxAttempts: payload?.maxAttempts || record.attemptsMade,
        lastError: record.lastError,
        inputPayload: payload?.jobData?.nodeData ?? payload?.jobData?.triggerPayload ?? null,
        errorStack: payload?.errorStack || null,
        timestamp: new Date(record.failedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        status: record.replayed ? "replayed" : "pending",
      };
    });

    const unresolvedCount = jobs.filter((j) => j.status === "pending").length;

    return NextResponse.json({
      success: true,
      jobs,
      totalCount: jobs.length,
      unresolvedCount,
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

/**
 * DELETE /api/v1/dlq
 * Purges dead-letter jobs from PostgreSQL.
 * Query param: ?replayedOnly=true to only delete replayed, or deletes all.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const replayedOnly = searchParams.get("replayedOnly") === "true";

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
    console.error("[DLQ Bulk DELETE] Failed to purge DLQ records:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to purge DLQ records" },
      { status: 500 }
    );
  }
}

export const POST = DELETE;

