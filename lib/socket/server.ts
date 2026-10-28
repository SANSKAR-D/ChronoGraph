import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";
import { createRedisConnection } from "@/lib/redis/client";

const SOCKET_PORT = parseInt(process.env.SOCKET_PORT || "3001", 10);

declare global {
  // eslint-disable-next-line no-var
  var __chronoGraphSocketIO: SocketIOServer | undefined;
}

export function initSocketServer(): SocketIOServer | null {
  // Never attempt to start Socket.IO HTTP server on Vercel serverless functions
  if (process.env.VERCEL || process.env.NEXT_RUNTIME === "edge") {
    return null;
  }

  if (globalThis.__chronoGraphSocketIO) {
    return globalThis.__chronoGraphSocketIO;
  }

  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  const redisSub = createRedisConnection();

  // Pattern subscribe to all run channels and direct subscribe to cluster events
  redisSub.subscribe("channel:cluster:events", (err) => {
    if (err) console.error("[Socket.IO] Failed to subscribe to channel:cluster:events", err);
  });

  redisSub.psubscribe("channel:run:*", (err) => {
    if (err) console.error("[Socket.IO] Failed to psubscribe to channel:run:*", err);
  });

  redisSub.on("message", (channel, message) => {
    if (channel === "channel:cluster:events") {
      try {
        const parsed = JSON.parse(message);
        const eventType = parsed.event || "message";
        io.to("cluster").emit("cluster:event", parsed);
        io.to("cluster").emit(eventType, parsed);
        io.to("cluster").emit("message", parsed);
      } catch {
        io.to("cluster").emit("message", message);
      }
    }
  });

  redisSub.on("pmessage", (_pattern, channel, message) => {
    // channel format: channel:run:<runId>
    const runId = channel.replace("channel:run:", "");
    if (!runId) return;

    try {
      const parsed = JSON.parse(message);
      const eventType = parsed.event || "message";
      io.to(`run:${runId}`).emit("run:event", parsed);
      io.to(`run:${runId}`).emit(eventType, parsed);
      io.to(`run:${runId}`).emit("message", parsed);
    } catch {
      io.to(`run:${runId}`).emit("message", message);
    }
  });

  io.on("connection", (socket) => {
    const handshakeRunId = socket.handshake.query.runId as string | undefined;
    const handshakeChannel = socket.handshake.query.channel as string | undefined;

    // Auto-join if provided in query
    if (handshakeRunId) {
      socket.join(`run:${handshakeRunId}`);
      socket.emit("connected", { status: "connected", runId: handshakeRunId });
    }

    if (handshakeChannel === "cluster" || !handshakeRunId) {
      socket.join("cluster");
      socket.emit("connected", { status: "connected", timestamp: new Date().toISOString() });
    }

    socket.on("subscribe:run", (runId: string) => {
      if (runId) {
        socket.join(`run:${runId}`);
        socket.emit("subscribed", { channel: `run:${runId}` });
      }
    });

    socket.on("unsubscribe:run", (runId: string) => {
      if (runId) {
        socket.leave(`run:${runId}`);
      }
    });

    socket.on("subscribe:cluster", () => {
      socket.join("cluster");
      socket.emit("subscribed", { channel: "cluster" });
    });
  });

  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[Socket.IO] Port ${SOCKET_PORT} already in use, reusing active socket server.`);
    } else {
      console.error("[Socket.IO] HTTP server error:", err);
    }
  });

  try {
    httpServer.listen(SOCKET_PORT, () => {
      console.log(`[Socket.IO] Real-time WebSocket server running on port ${SOCKET_PORT}`);
    });
  } catch (err) {
    console.warn("[Socket.IO] Listen call handled:", err);
  }

  globalThis.__chronoGraphSocketIO = io;
  return io;
}
