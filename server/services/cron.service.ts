import {
  scheduleWorkflowCron,
  removeWorkflowCron,
  listScheduledCronJobs,
  syncAllActiveCronWorkflows,
  triggerWorkflowCronNow,
  validateCronExpression,
  type ScheduleCronParams,
  type ScheduledCronJobInfo,
} from "@/lib/cron/scheduler";

export const CronService = {
  validateCronExpression,
  scheduleWorkflow: (params: ScheduleCronParams) => scheduleWorkflowCron(params),
  removeWorkflow: (workflowId: string, clearDb = true) =>
    removeWorkflowCron(workflowId, { clearDbExpression: clearDb }),
  listScheduledJobs: (): Promise<ScheduledCronJobInfo[]> => listScheduledCronJobs(),
  syncActiveWorkflows: () => syncAllActiveCronWorkflows(),
  triggerNow: (workflowId: string) => triggerWorkflowCronNow(workflowId),
};

export default CronService;
