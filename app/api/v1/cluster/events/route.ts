import { NextRequest } from "next/server";
import { createRedisConnection } from "@/lib/redis/client";


export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const channel = "channel:cluster:events";
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

      // On serverless platforms (Vercel), auto-close after 50s so EventSource can cleanly reconnect without runtime timeout
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
        } catch {
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
        }
      });

      subscriber.on("error", (err) => {
        console.error("[ClusterEventsSSE] Redis error:", err);
      });

      await subscriber.subscribe(channel);

      // Initial connection handshake
      controller.enqueue(
        encoder.encode(
          `event: connected\ndata: ${JSON.stringify({
            status: "connected",
            timestamp: new Date().toISOString(),
          })}\n\n`
        )
      );

      // 15s keepalive ping
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
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
