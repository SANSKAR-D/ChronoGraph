export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { seedAllWorkflows } = await import("./scripts/seed-workflows");
      await seedAllWorkflows({ silent: true });
    } catch {
      // Gracefully handle if database or redis is not yet booted during cold start
    }
  }
}
