import { NextResponse } from "next/server";
import { getClusterHealth } from "@/lib/telemetry/cluster-health";
import { initSocketServer } from "@/lib/socket/server";

/**
 * GET /api/v1/cluster/health
 *
 * Implements Task T4.3:
 * Returns active worker count, heartbeat timestamps, and queue metrics (Waiting, Active, Delayed, DLQ).
 */
export async function GET() {
  try {
    initSocketServer();
  } catch {}

  try {
    const health = await getClusterHealth();

    const statusCode = health.status === "down" ? 503 : 200;

    return NextResponse.json(health, {
      status: statusCode,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Content-Type": "application/json",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[ClusterHealthAPI] Unhandled error during cluster health evaluation:", err);

    return NextResponse.json(
      {
        status: "down",
        timestamp: new Date().toISOString(),
        error: errorMsg,
        activeWorkerCount: 0,
        activeWorkers: 0,
        heartbeatTimestamps: {},
        workers: [],
        queueMetrics: {
          waiting: 0,
          active: 0,
          delayed: 0,
          dlq: 0,
          failed: 0,
          completed: 0,
          Waiting: 0,
          Active: 0,
          Delayed: 0,
          DLQ: 0,
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
