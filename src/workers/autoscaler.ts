import { fork, ChildProcess } from "child_process";
import path from "path";
import crypto from "crypto";
import { Queue } from "bullmq";
import { QUEUE_NAMES, getDagExecutionQueue } from "@/lib/queue/bullmq";
import { redis as defaultRedis } from "@/lib/redis/client";

export interface AutoscalerConfig {
  minWorkers?: number;
  maxWorkers?: number;
  targetBacklogPerWorker?: number;
  pollIntervalMs?: number;
  scaleDownCooldownMs?: number;
  workerConcurrency?: number;
  workerScriptPath?: string;
  redisClient?: any;
  dagQueueClient?: Queue;
}

export interface ManagedWorkerProcess {
  id: string;
  pid: number;
  process: ChildProcess;
  startedAt: Date;
  isShuttingDown: boolean;
}

export interface AutoscalerTelemetryState {
  enabled: boolean;
  status: "idle" | "scaling_up" | "scaling_down" | "optimal" | "offline";
  currentWorkers: number;
  desiredWorkers: number;
  minWorkers: number;
  maxWorkers: number;
  targetBacklogPerWorker: number;
  queue: {
    waiting: number;
    active: number;
  };
  lastAction: string;
  updatedAt: string;
}

/**
 * Calculates desired number of active worker processes based on queue backlog and load.
 * Pure function for testing and predictable scaling logic.
 */
export function calculateDesiredWorkers(
  waitingJobs: number,
  activeJobs: number,
  currentWorkers: number,
  config: { minWorkers: number; maxWorkers: number; targetBacklogPerWorker: number }
): number {
  const min = Math.max(1, config.minWorkers);
  const max = Math.max(min, config.maxWorkers);
  const targetPerWorker = Math.max(1, config.targetBacklogPerWorker);

  // If there's no waiting queue and no active work, scale to minimum
  if (waitingJobs <= 0 && activeJobs <= 0) {
    return min;
  }

  // Calculate workers required to drain the pending backlog
  const backlogDemand = Math.ceil(waitingJobs / targetPerWorker);

  // If jobs are waiting, ensure we have at least 1 extra capacity beyond current active
  const calculated = Math.max(min, backlogDemand);

  return Math.min(max, calculated);
}

/**
 * Celery-inspired Dynamic Worker Autoscaler for BullMQ & Redis.
 *
 * Automatically monitors the DAG execution queue, dynamically spawns and terminates
 * child worker processes between minWorkers and maxWorkers, enforces scale-down cooldown,
 * recovers crashed workers, and broadcasts real-time cluster telemetry.
 */
export class WorkerAutoscaler {
  public readonly minWorkers: number;
  public readonly maxWorkers: number;
  public readonly targetBacklogPerWorker: number;
  public readonly pollIntervalMs: number;
  public readonly scaleDownCooldownMs: number;
  public readonly workerConcurrency: number;
  public readonly workerScriptPath: string;

  private redisClient: any;
  private dagQueueClient: Queue;
  private managedWorkers: Map<string, ManagedWorkerProcess> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private lastScaleDownTime: number = 0;
  private lastAction: string = "Autoscaler initialized";
  private isRunning: boolean = false;

  constructor(options?: AutoscalerConfig) {
    this.minWorkers = options?.minWorkers ?? parseInt(process.env.AUTOSCALE_MIN_WORKERS || "1", 10);
    this.maxWorkers = options?.maxWorkers ?? parseInt(process.env.AUTOSCALE_MAX_WORKERS || "6", 10);
    this.targetBacklogPerWorker =
      options?.targetBacklogPerWorker ??
      parseInt(process.env.AUTOSCALE_TARGET_BACKLOG || "5", 10);
    this.pollIntervalMs = options?.pollIntervalMs ?? 1500;
    this.scaleDownCooldownMs = options?.scaleDownCooldownMs ?? 10000;
    this.workerConcurrency =
      options?.workerConcurrency ?? parseInt(process.env.WORKER_CONCURRENCY || "5", 10);

    this.workerScriptPath =
      options?.workerScriptPath || path.resolve(__dirname, "dag-worker.ts");

    this.redisClient = options?.redisClient ?? defaultRedis;
    this.dagQueueClient = options?.dagQueueClient ?? getDagExecutionQueue();
  }

  /**
   * Returns current managed workers count (excluding those currently in shutdown).
   */
  public getActiveWorkerCount(): number {
    let count = 0;
    for (const worker of this.managedWorkers.values()) {
      if (!worker.isShuttingDown) {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns list of currently active worker IDs.
   */
  public getManagedWorkerIds(): string[] {
    return Array.from(this.managedWorkers.keys());
  }

  /**
   * Spawns a new DAG worker child process using fork.
   */
  public spawnWorker(customId?: string): ManagedWorkerProcess | null {
    if (this.managedWorkers.size >= this.maxWorkers) {
      return null;
    }

    const workerId =
      customId ||
      `autoscale-worker-${this.managedWorkers.size + 1}-${crypto.randomBytes(3).toString("hex")}`;

    try {
      const child = fork(this.workerScriptPath, [], {
        env: {
          ...process.env,
          WORKER_ID: workerId,
          WORKER_CONCURRENCY: this.workerConcurrency.toString(),
          RUN_STANDALONE_WORKER: "true",
          IS_FORKED_CHILD: "true",
        },
        stdio: "inherit",
      });

      const managed: ManagedWorkerProcess = {
        id: workerId,
        pid: child.pid || 0,
        process: child,
        startedAt: new Date(),
        isShuttingDown: false,
      };

      child.on("exit", (code, signal) => {
        this.handleWorkerExit(workerId, code, signal);
      });

      child.on("error", (err) => {
        console.error(`[WorkerAutoscaler] Worker process error for ${workerId}:`, err);
      });

      this.managedWorkers.set(workerId, managed);
      return managed;
    } catch (err) {
      console.error(`[WorkerAutoscaler] Failed to spawn worker ${workerId}:`, err);
      return null;
    }
  }

  /**
   * Gracefully downscales by terminating one active worker.
   */
  public terminateOneWorker(): boolean {
    // Pick the most recently spawned active worker
    const workers = Array.from(this.managedWorkers.values()).filter((w) => !w.isShuttingDown);
    if (workers.length <= this.minWorkers) {
      return false;
    }

    const victim = workers[workers.length - 1];
    victim.isShuttingDown = true;

    try {
      // Send SIGTERM to let BullMQ finish current in-flight job cleanly
      victim.process.kill("SIGTERM");
      return true;
    } catch (err) {
      console.warn(`[WorkerAutoscaler] Failed to signal SIGTERM to ${victim.id}:`, err);
      this.managedWorkers.delete(victim.id);
      return false;
    }
  }

  /**
   * Handles child process termination (graceful or crash).
   */
  private handleWorkerExit(workerId: string, code: number | null, signal: string | null) {
    const existing = this.managedWorkers.get(workerId);
    const wasExpected = existing?.isShuttingDown ?? false;

    this.managedWorkers.delete(workerId);

    if (!wasExpected && this.isRunning) {
      console.warn(
        `[WorkerAutoscaler] ⚠️ Worker ${workerId} exited unexpectedly (code: ${code}, signal: ${signal}).`
      );

      // Auto-heal: Ensure we always maintain at least minWorkers
      if (this.getActiveWorkerCount() < this.minWorkers) {
        console.log(`[WorkerAutoscaler] 🩹 Auto-healing: spawning replacement worker.`);
        this.spawnWorker();
      }
    }
  }

  /**
   * Core autoscaling evaluation cycle.
   */
  public async evaluateAndScale(): Promise<AutoscalerTelemetryState> {
    let waiting = 0;
    let active = 0;

    try {
      const counts = await this.dagQueueClient.getJobCounts("waiting", "active");
      waiting = counts.waiting || 0;
      active = counts.active || 0;
    } catch (err) {
      console.warn("[WorkerAutoscaler] Could not inspect queue counts:", err);
    }

    const currentCount = this.getActiveWorkerCount();
    const desiredCount = calculateDesiredWorkers(waiting, active, currentCount, {
      minWorkers: this.minWorkers,
      maxWorkers: this.maxWorkers,
      targetBacklogPerWorker: this.targetBacklogPerWorker,
    });

    let status: AutoscalerTelemetryState["status"] = "optimal";
    const now = Date.now();

    if (desiredCount > currentCount) {
      // Scale UP immediately to handle load spike
      const deficit = desiredCount - currentCount;
      status = "scaling_up";
      this.lastAction = `Scaled up: +${deficit} workers (queue waiting: ${waiting}, active: ${active})`;
      console.log(`[WorkerAutoscaler] 🚀 ${this.lastAction}`);

      for (let i = 0; i < deficit; i++) {
        this.spawnWorker();
      }
      this.lastScaleDownTime = now;
    } else if (desiredCount < currentCount) {
      // Scale DOWN only after cooldown to avoid rapid flapping
      const timeSinceCooldown = now - this.lastScaleDownTime;
      if (timeSinceCooldown >= this.scaleDownCooldownMs) {
        status = "scaling_down";
        this.lastAction = `Scaled down: -1 worker (cooldown satisfied: ${Math.round(timeSinceCooldown / 1000)}s)`;
        console.log(`[WorkerAutoscaler] 📉 ${this.lastAction}`);
        this.terminateOneWorker();
        this.lastScaleDownTime = now;
      } else {
        status = "optimal";
        this.lastAction = `Cooldown active (${Math.round((this.scaleDownCooldownMs - timeSinceCooldown) / 1000)}s remaining)`;
      }
    } else {
      status = currentCount === this.minWorkers && waiting === 0 && active === 0 ? "idle" : "optimal";
    }

    const telemetryState: AutoscalerTelemetryState = {
      enabled: true,
      status,
      currentWorkers: this.getActiveWorkerCount(),
      desiredWorkers: desiredCount,
      minWorkers: this.minWorkers,
      maxWorkers: this.maxWorkers,
      targetBacklogPerWorker: this.targetBacklogPerWorker,
      queue: { waiting, active },
      lastAction: this.lastAction,
      updatedAt: new Date().toISOString(),
    };

    // Emit telemetry to Redis for real-time dashboard UI
    try {
      await Promise.all([
        this.redisClient.set(
          "cluster:autoscaler:state",
          JSON.stringify(telemetryState),
          "EX",
          30
        ),
        this.redisClient.publish(
          "channel:cluster:events",
          JSON.stringify({
            event: "AUTOSCALER_UPDATE",
            ...telemetryState,
          })
        ),
      ]);
    } catch {
      // Non-critical telemetry broadcast
    }

    return telemetryState;
  }

  /**
   * Starts the autoscaler supervisor loop.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `⚡ [WorkerAutoscaler] Starting Celery-style worker autoscaler (min: ${this.minWorkers}, max: ${this.maxWorkers}, target: ${this.targetBacklogPerWorker} jobs/worker)...`
    );

    // Warm up minimum worker pool
    while (this.getActiveWorkerCount() < this.minWorkers) {
      this.spawnWorker();
    }

    // Run first evaluation
    await this.evaluateAndScale();

    // Start evaluation poll timer
    this.pollTimer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        await this.evaluateAndScale();
      } catch (err) {
        console.warn("[WorkerAutoscaler] Error in autoscaling loop:", err);
      }
    }, this.pollIntervalMs);
  }

  /**
   * Gracefully shuts down all managed worker child processes and clears timers.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    console.log(`[WorkerAutoscaler] Shutting down ${this.managedWorkers.size} workers gracefully...`);

    const terminationPromises = Array.from(this.managedWorkers.values()).map((managed) => {
      managed.isShuttingDown = true;
      return new Promise<void>((resolve) => {
        try {
          managed.process.once("exit", () => resolve());
          managed.process.kill("SIGTERM");
          // Safety timeout to avoid hanging forever
          setTimeout(() => {
            try {
              managed.process.kill("SIGKILL");
            } catch {}
            resolve();
          }, 3000);
        } catch {
          resolve();
        }
      });
    });

    await Promise.all(terminationPromises);
    this.managedWorkers.clear();

    try {
      await this.redisClient.del("cluster:autoscaler:state");
    } catch {}

    console.log("[WorkerAutoscaler] All workers stopped cleanly.");
  }
}

// Standalone CLI execution entrypoint: tsx src/workers/autoscaler.ts
if (require.main === module || process.env.RUN_STANDALONE_AUTOSCALER === "true") {
  // Bind lightweight healthcheck HTTP server for PaaS web services (Render, Railway, Koyeb)
  if (process.env.PORT || process.env.RENDER) {
    import("http").then((http) => {
      const port = parseInt(process.env.PORT || "10000", 10);
      const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ChronoGraph Worker Autoscaler Healthy\n");
      });
      server.listen(port, "0.0.0.0", () => {
        console.log(`[WorkerAutoscaler] PaaS HTTP Healthcheck listening on port ${port}`);
      });
    }).catch(() => {});
  }

  const autoscaler = new WorkerAutoscaler();
  autoscaler.start().catch((err) => {
    console.error("[WorkerAutoscaler] Fatal error:", err);
    process.exit(1);
  });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down worker autoscaler...`);
    await autoscaler.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
