import { NextRequest } from "next/server";
import { createRedisConnection } from "@/lib/redis/client";


export async function GET(req: NextRequest) {
  const channel = "channel:cluster:events";
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
        subscriber.quit().catch(() => subscriber.disconnect());
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
