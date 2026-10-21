-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED', 'ABORTED');

-- CreateEnum
CREATE TYPE "node_exec_status" AS ENUM ('IDLE', 'QUEUED', 'RUNNING', 'RETRYING', 'SUCCESS', 'FAILED', 'DLQ');

-- CreateEnum
CREATE TYPE "trigger_source" AS ENUM ('WEBHOOK', 'CRON', 'MANUAL');

-- CreateTable
CREATE TABLE "workflow_blueprints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "webhook_secret" VARCHAR(128) NOT NULL,
    "cron_expression" VARCHAR(64),
    "nodes_json" JSONB NOT NULL,
    "edges_json" JSONB NOT NULL,
    "adjacency_map" JSONB NOT NULL,
    "base_indegrees" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" UUID NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'PENDING',
    "trigger_type" "trigger_source" NOT NULL,
    "trigger_payload" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_execution_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "node_id" VARCHAR(128) NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "status" "node_exec_status" NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "input_payload" JSONB,
    "output_payload" JSONB,
    "error_message" TEXT,
    "http_status_code" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "node_id" VARCHAR(128) NOT NULL,
    "failed_payload" JSONB NOT NULL,
    "last_error" TEXT NOT NULL,
    "attempts_made" INTEGER NOT NULL,
    "replayed" BOOLEAN NOT NULL DEFAULT false,
    "failed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_runs_workflow" ON "workflow_runs"("workflow_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "node_execution_logs_idempotency_key_key" ON "node_execution_logs"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_logs_run_node" ON "node_execution_logs"("run_id", "node_id");

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow_blueprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_execution_logs" ADD CONSTRAINT "node_execution_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dead_letter_jobs" ADD CONSTRAINT "dead_letter_jobs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
