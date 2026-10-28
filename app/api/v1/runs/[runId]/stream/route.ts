import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRedisConnection } from "@/lib/redis/client";


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
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (pingTimer) clearInterval(pingTimer);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {
          subscriber.disconnect();
        });
      };

      req.signal.addEventListener("abort", cleanup);

      subscriber.on("message", (chan, msg) => {
        if (chan !== channel || isClosed) return;
        try {
          const parsed = JSON.parse(msg);
          const eventType = parsed.event || "message";
          controller.enqueue(
            encoder.encode(`event: ${eventType}\ndata: ${msg}\n\nevent: message\ndata: ${msg}\n\n`)
          );
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
