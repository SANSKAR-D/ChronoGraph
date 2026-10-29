import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRedisConnection } from "@/lib/redis/client";


export const maxDuration = 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;

  if (!UUID_REGEX.test(runId)) {
    return NextResponse.json(
      { success: false, error: "Invalid run UUID format." },
      { status: 400 }
    );
  }

  const run = await db.workflowRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true },
  });

  if (!run) {
    return NextResponse.json(
      { success: false, error: `Workflow run '${runId}' was not found.` },
      { status: 404 }
    );
  }

  const channel = `channel:run:${runId}`;
  const subscriber = createRedisConnection();
  const encoder = new TextEncoder();
  let pingTimer: NodeJS.Timeout | null = null;
  let autoCloseTimer: NodeJS.Timeout | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (pingTimer) clearInterval(pingTimer);
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => subscriber.disconnect());
        try {
          controller.close();
        } catch {}
      };

      req.signal.addEventListener("abort", cleanup);

      // On serverless platforms (Vercel), auto-close after 50s to avoid 300s runtime execution timeouts
      if (process.env.VERCEL) {
        autoCloseTimer = setTimeout(cleanup, 50000);
        if (autoCloseTimer.unref) autoCloseTimer.unref();
      }

      subscriber.on("message", (chan, msg) => {
        if (chan !== channel || isClosed) return;
        try {
          const parsed = JSON.parse(msg);
          const eventType = parsed.event || "message";
          controller.enqueue(
            encoder.encode(`event: ${eventType}\ndata: ${msg}\n\nevent: message\ndata: ${msg}\n\n`)
          );

          if (
            ["COMPLETED", "FAILED", "CANCELLED"].includes(parsed.status) ||
            parsed.event === "RUN_COMPLETED"
          ) {
            setTimeout(cleanup, 200);
          }
        } catch {
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
        }
      });

      subscriber.on("error", (err) => {
        console.error(`[SSE Subscriber Error] ${runId}:`, err);
      });

      await subscriber.subscribe(channel);

      // Initial connection handshake
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({
            status: "connected",
            runId,
            initialRunStatus: run.status,
          })}\n\n`
        )
      );

      // If run was already finished, close stream cleanly immediately after sending handshake
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) {
        setTimeout(cleanup, 100);
        return;
      }

      // 15s keep-alive heartbeat to prevent proxy timeouts
      pingTimer = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);
    },
    cancel() {
      if (!isClosed) {
        if (pingTimer) clearInterval(pingTimer);
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => subscriber.disconnect());
        isClosed = true;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
