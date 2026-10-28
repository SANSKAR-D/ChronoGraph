import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/v1/dlq/[jobId]
 * Deletes an individual dead-letter job record from PostgreSQL.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId || !UUID_REGEX.test(jobId)) {
      return NextResponse.json(
        { success: false, error: "Invalid DLQ Job ID: Must be valid UUID" },
        { status: 400 }
      );
    }

    const existing = await db.deadLetterJob.findUnique({
      where: { id: jobId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `DLQ job ${jobId} not found` },
        { status: 404 }
      );
    }

    await db.deadLetterJob.delete({
      where: { id: jobId },
    });

    return NextResponse.json({
      success: true,
      message: `Dead-letter job ${jobId} deleted successfully.`,
      deletedId: jobId,
    });
  } catch (error: any) {
    console.error("[DLQ DELETE] Failed to delete DLQ job:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete DLQ record" },
      { status: 500 }
    );
  }
}

export const POST = DELETE;
