export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { seedAllWorkflows } = await import("./scripts/seed-workflows");
      await seedAllWorkflows({ silent: true });
    } catch {
      // Gracefully handle if database or redis is not yet booted during cold start
    }

    try {
      const { initSocketServer } = await import("./lib/socket/server");
      initSocketServer();
    } catch (err) {
      console.warn("[WebSocket] Could not initialize Socket.IO server:", err);
    }

    if (process.env.NEXT_PHASE !== "phase-production-build" && process.env.ENABLE_EMBEDDED_WORKER !== "false" && !process.env.VERCEL) {
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
