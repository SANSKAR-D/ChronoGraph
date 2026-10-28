export async function register() {
  // On Vercel serverless functions, never spawn background servers, daemons, or long-lived workers
  if (process.env.VERCEL) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { seedAllWorkflows } = await import("./scripts/seed-workflows");
      seedAllWorkflows({ silent: true }).catch(() => {});
    } catch {
      // Gracefully handle if database or redis is not yet booted during cold start
    }

    try {
      const { initSocketServer } = await import("./lib/socket/server");
      initSocketServer();
    } catch (err) {
      console.warn("[WebSocket] Could not initialize Socket.IO server:", err);
    }

    if (process.env.NEXT_PHASE !== "phase-production-build" && process.env.ENABLE_EMBEDDED_WORKER !== "false") {
      try {
        const { startDagWorker } = await import("./src/workers/dag-worker");
        startDagWorker();
        console.log("[Worker] Embedded DAG execution worker started.");
      } catch (err) {
        console.warn("[Worker] Could not initialize embedded DAG worker:", err);
      }
    }
  }
}
