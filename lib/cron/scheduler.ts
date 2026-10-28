import { CronExpressionParser } from "cron-parser";
import { getCronQueue } from "@/lib/queue/bullmq";
import { db } from "@/lib/db";
import { executeCronWorkflowTrigger, CronExecutionResult } from "./trigger-executor";

export const CRON_SCHEDULER_PREFIX = "cron";
export const CRON_TRIGGER_JOB_NAME = "cron-workflow-trigger";

export interface CronValidationResult {
  isValid: boolean;
  error?: string;
  nextRun?: Date;
  nextRuns?: Date[];
}

export interface ScheduledCronJobInfo {
  schedulerId: string;
  workflowId: string;
  workflowName: string;
  description?: string | null;
  cronExpression: string;
  timezone?: string;
  isActive: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  totalRunsCount: number;
}

export interface ScheduleCronParams {
  workflowId: string;
  cronExpression: string;
  timezone?: string;
  immediately?: boolean;
}

/**
 * Validates a standard 5-field cron expression using cron-parser.
 * Returns the parsed validity status and next scheduled execution timestamps.
 */
export function validateCronExpression(
  expression: string,
  options?: { tz?: string; count?: number }
): CronValidationResult {
  if (!expression || typeof expression !== "string" || expression.trim() === "") {
    return {
      isValid: false,
      error: "Cron expression cannot be empty.",
    };
  }

  const trimmed = expression.trim();

  try {
    const parsed = CronExpressionParser.parse(trimmed, {
      tz: options?.tz || "UTC",
    });

    const nextRun = parsed.next().toDate();
    const count = options?.count || 3;
    const nextRuns: Date[] = [nextRun];

    for (let i = 1; i < count; i++) {
      nextRuns.push(parsed.next().toDate());
    }

    return {
      isValid: true,
      nextRun,
      nextRuns,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      error: `Invalid cron expression "${trimmed}": ${errorMsg}`,
    };
  }
}

/**
 * Generates the deterministic BullMQ scheduler ID for a given workflow.
 */
export function getSchedulerId(workflowId: string): string {
  return `${CRON_SCHEDULER_PREFIX}:${workflowId}`;
}

/**
 * Connects BullMQ repeatable jobs (via queue.upsertJobScheduler) to trigger workflows
 * on cron schedules. Updates the database record and synchronizes the active schedule.
 */
export async function scheduleWorkflowCron({
  workflowId,
  cronExpression,
  timezone = "UTC",
  immediately = false,
}: ScheduleCronParams): Promise<{
  success: boolean;
  schedulerId: string;
  nextRunAt?: string;
  error?: string;
}> {
  // 1. Validate Cron syntax
  const validation = validateCronExpression(cronExpression, { tz: timezone });
  if (!validation.isValid || !validation.nextRun) {
    return {
      success: false,
      schedulerId: getSchedulerId(workflowId),
      error: validation.error || "Invalid cron expression provided.",
    };
  }

  // 2. Verify workflow existence in database
  const blueprint = await db.workflowBlueprint.findUnique({
    where: { id: workflowId },
  });

  if (!blueprint) {
    return {
      success: false,
      schedulerId: getSchedulerId(workflowId),
      error: `Workflow blueprint ${workflowId} not found in database.`,
    };
  }

  const schedulerId = getSchedulerId(workflowId);
  const cronQueue = getCronQueue();

  try {
    // 3. Register BullMQ repeatable job via upsertJobScheduler
    await cronQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronExpression.trim(),
        tz: timezone,
        immediately,
      },
      {
        name: CRON_TRIGGER_JOB_NAME,
        data: {
          workflowId,
          cronExpression: cronExpression.trim(),
          timezone,
          scheduledBy: "ChronoGraph Cron Trigger Engine",
        },
      }
    );

    // 4. Update workflow blueprint in database with new cron expression and active state
    await db.workflowBlueprint.update({
      where: { id: workflowId },
      data: {
        cronExpression: cronExpression.trim(),
        isActive: true,
      },
    });

    return {
      success: true,
      schedulerId,
      nextRunAt: validation.nextRun.toISOString(),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[CronScheduler] Error registering scheduler for ${workflowId}:`, err);
    return {
      success: false,
      schedulerId,
      error: errorMsg,
    };
  }
}

/**
 * Removes an existing BullMQ repeatable cron scheduler and unbinds the schedule from DB.
 */
export async function removeWorkflowCron(
  workflowId: string,
  options?: { clearDbExpression?: boolean }
): Promise<{ success: boolean; schedulerId: string; error?: string }> {
  const schedulerId = getSchedulerId(workflowId);
  const cronQueue = getCronQueue();

  try {
    await cronQueue.removeJobScheduler(schedulerId);

    // Update database record
    if (options?.clearDbExpression) {
      await db.workflowBlueprint.update({
        where: { id: workflowId },
        data: { cronExpression: null },
      });
    }

    return {
      success: true,
      schedulerId,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[CronScheduler] Error removing scheduler ${schedulerId}:`, err);
    return {
      success: false,
      schedulerId,
      error: errorMsg,
    };
  }
}

/**
 * Alias for removeWorkflowCron for semantic clarity in workflow deletion
 */
export const removeRepeatableJobScheduler = removeWorkflowCron;

/**
 * Fetches all registered BullMQ repeatable job schedulers and enriches them
 * with PostgreSQL workflow blueprint metadata.
 */
export async function listScheduledCronJobs(): Promise<ScheduledCronJobInfo[]> {
  const cronQueue = getCronQueue();
  const schedulers = await cronQueue.getJobSchedulers();

  if (!schedulers || schedulers.length === 0) {
    return [];
  }

  // Extract workflow IDs from scheduler keys (format: "cron:<workflowId>")
  const workflowIds = schedulers
    .map((s) => {
      const match = s.key?.match(/^cron:(.+)$/);
      return match ? match[1] : null;
    })
    .filter((id): id is string => Boolean(id));

  // Query database for workflow metadata
  const blueprints = await db.workflowBlueprint.findMany({
    where: { id: { in: workflowIds } },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { startedAt: true },
      },
      _count: {
        select: { runs: true },
      },
    },
  });

  const blueprintMap = new Map(blueprints.map((b) => [b.id, b]));

  return schedulers.map((s) => {
    const match = s.key?.match(/^cron:(.+)$/);
    const wfId = match ? match[1] : s.key || "unknown";
    const blueprint = blueprintMap.get(wfId);

    let nextRunAt: string | null = null;
    if (s.pattern) {
      try {
        const parsed = CronExpressionParser.parse(s.pattern, { tz: s.tz || "UTC" });
        nextRunAt = parsed.next().toISOString();
      } catch {
        // Fallback if parsing fails
      }
    }

    return {
      schedulerId: s.key || `cron:${wfId}`,
      workflowId: wfId,
      workflowName: blueprint?.name || "Unknown Workflow",
      description: blueprint?.description,
      cronExpression: s.pattern || blueprint?.cronExpression || "",
      timezone: s.tz || "UTC",
      isActive: blueprint?.isActive ?? true,
      nextRunAt: nextRunAt || (s.next ? new Date(s.next).toISOString() : null),
      lastRunAt: blueprint?.runs[0]?.startedAt?.toISOString() || null,
      totalRunsCount: blueprint?._count.runs ?? 0,
    };
  });
}

/**
 * Synchronizes all active workflows in PostgreSQL having a `cronExpression`
 * with BullMQ repeatable schedulers. Useful on server boot or during recovery.
 */
export async function syncAllActiveCronWorkflows(): Promise<{
  synced: number;
  totalActive: number;
  errors: string[];
}> {
  const activeBlueprints = await db.workflowBlueprint.findMany({
    where: {
      isActive: true,
      cronExpression: { not: null },
    },
  });

  let synced = 0;
  const errors: string[] = [];

  for (const bp of activeBlueprints) {
    if (!bp.cronExpression) continue;

    const res = await scheduleWorkflowCron({
      workflowId: bp.id,
      cronExpression: bp.cronExpression,
    });

    if (res.success) {
      synced++;
    } else {
      errors.push(`Failed for "${bp.name}" (${bp.id}): ${res.error}`);
    }
  }

  return {
    synced,
    totalActive: activeBlueprints.length,
    errors,
  };
}

/**
 * Immediately triggers a manual execution of a cron-managed workflow.
 * Bypasses the schedule timer to test end-to-end pipeline ingestion immediately.
 */
export async function triggerWorkflowCronNow(
  workflowId: string
): Promise<CronExecutionResult> {
  return executeCronWorkflowTrigger(workflowId, {
    triggeredBy: "MANUAL_TEST_CRON_TRIGGER",
  });
}
