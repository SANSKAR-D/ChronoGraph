import { io, Socket } from "socket.io-client";

let sharedSocket: Socket | null = null;

export function getSocket(query?: Record<string, string>): Socket | null {
  if (typeof window === "undefined") {
    // In SSR context, return a dummy or disconnected socket
    return null;
  }

  const customUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // In cloud/hosted environments without a dedicated socket server, use SSE fallback cleanly
  if (!customUrl && !isLocal) {
    return null;
  }

  const port = process.env.NEXT_PUBLIC_SOCKET_PORT || "3001";
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const url = customUrl || `${protocol}//${window.location.hostname}:${port}`;

  if (!sharedSocket || sharedSocket.disconnected) {
    sharedSocket = io(url, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      query,
    });
  }

  if (query && sharedSocket) {
    const emitSubs = () => {
      if (query.runId) {
        sharedSocket?.emit("subscribe:run", query.runId);
      }
      if (query.channel === "cluster") {
        sharedSocket?.emit("subscribe:cluster");
      }
    };

    if (sharedSocket.connected) {
      emitSubs();
    } else {
      sharedSocket.once("connect", emitSubs);
    }
  }

  return sharedSocket;
}
