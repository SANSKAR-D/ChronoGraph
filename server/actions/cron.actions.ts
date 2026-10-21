"use server";

import {
  scheduleWorkflowCron,
  removeWorkflowCron,
  listScheduledCronJobs,
  syncAllActiveCronWorkflows,
  triggerWorkflowCronNow,
  validateCronExpression,
} from "@/lib/cron/scheduler";
import { revalidatePath } from "next/cache";

export async function scheduleWorkflowCronAction(formData: {
  workflowId: string;
  cronExpression: string;
  timezone?: string;
  immediately?: boolean;
}) {
  const result = await scheduleWorkflowCron(formData);
  revalidatePath("/");
  return result;
}

export async function removeWorkflowCronAction(workflowId: string) {
  const result = await removeWorkflowCron(workflowId, { clearDbExpression: true });
  revalidatePath("/");
  return result;
}

export async function listCronJobsAction() {
  return listScheduledCronJobs();
}

export async function validateCronAction(expression: string, tz?: string) {
  return validateCronExpression(expression, { tz });
}

export async function triggerWorkflowCronNowAction(workflowId: string) {
  const result = await triggerWorkflowCronNow(workflowId);
  revalidatePath("/");
  return result;
}

export async function syncCronJobsAction() {
  const result = await syncAllActiveCronWorkflows();
  revalidatePath("/");
  return result;
}
