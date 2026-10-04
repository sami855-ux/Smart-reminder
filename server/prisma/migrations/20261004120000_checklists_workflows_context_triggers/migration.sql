CREATE TYPE "WorkflowLifecycle" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');
CREATE TYPE "WorkflowRunLifecycle" AS ENUM ('ACTIVE', 'COMPLETED', 'STOPPED');
CREATE TYPE "WorkflowStepCondition" AS ENUM ('PREVIOUS_COMPLETED', 'ALL_CHECKLIST_COMPLETED');
CREATE TYPE "WorkflowStepRunLifecycle" AS ENUM ('ACTIVE', 'COMPLETED', 'STOPPED');
CREATE TYPE "ContextTriggerType" AS ENUM ('LOCATION_ARRIVE', 'LOCATION_LEAVE', 'WIFI_CONNECT');
CREATE TYPE "ContextTriggerLifecycle" AS ENUM ('ACTIVE', 'PAUSED', 'UNAVAILABLE');
CREATE TYPE "TriggerEvaluationOutcome" AS ENUM ('FIRED', 'SUPPRESSED', 'REJECTED');

ALTER TYPE "ReminderEventType" ADD VALUE 'CHECKLIST_UPDATED';
ALTER TYPE "ReminderEventType" ADD VALUE 'CHECKLIST_ITEM_CHECKED';
ALTER TYPE "ReminderEventType" ADD VALUE 'CHECKLIST_ITEM_UNCHECKED';
ALTER TYPE "ReminderEventType" ADD VALUE 'WORKFLOW_CREATED';
ALTER TYPE "ReminderEventType" ADD VALUE 'WORKFLOW_STEP_ACTIVATED';
ALTER TYPE "ReminderEventType" ADD VALUE 'WORKFLOW_COMPLETED';
ALTER TYPE "ReminderEventType" ADD VALUE 'CONTEXT_TRIGGER_CREATED';
ALTER TYPE "ReminderEventType" ADD VALUE 'CONTEXT_TRIGGER_FIRED';

CREATE TABLE "reminder_checklist_items" (
  "id" UUID NOT NULL,
  "reminder_id" UUID NOT NULL,
  "text" VARCHAR(240) NOT NULL,
  "position" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "reminder_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "occurrence_checklist_items" (
  "id" UUID NOT NULL,
  "occurrence_id" UUID NOT NULL,
  "source_item_id" UUID,
  "text" VARCHAR(240) NOT NULL,
  "position" INTEGER NOT NULL,
  "checked_at" TIMESTAMPTZ(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "occurrence_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_workflows" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "source_reminder_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "lifecycle" "WorkflowLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "reminder_workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_steps" (
  "id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "context_note" VARCHAR(2000),
  "delay_minutes" INTEGER NOT NULL DEFAULT 0,
  "condition" "WorkflowStepCondition" NOT NULL DEFAULT 'PREVIOUS_COMPLETED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_runs" (
  "id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "source_occurrence_id" UUID NOT NULL,
  "lifecycle" "WorkflowRunLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "current_position" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_step_runs" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "step_id" UUID NOT NULL,
  "generated_reminder_id" UUID NOT NULL,
  "generated_occurrence_id" UUID NOT NULL,
  "lifecycle" "WorkflowStepRunLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "activated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "workflow_step_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "context_triggers" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "reminder_id" UUID NOT NULL,
  "type" "ContextTriggerType" NOT NULL,
  "lifecycle" "ContextTriggerLifecycle" NOT NULL DEFAULT 'ACTIVE',
  "label" VARCHAR(120) NOT NULL,
  "location_ciphertext" TEXT,
  "location_key_version" INTEGER,
  "radius_meters" INTEGER,
  "network_fingerprint" CHAR(64),
  "cooldown_seconds" INTEGER NOT NULL DEFAULT 300,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "last_triggered_at" TIMESTAMPTZ(3),
  "unavailable_reason" VARCHAR(120),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "context_triggers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trigger_evaluations" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "trigger_id" UUID NOT NULL,
  "installation_id" UUID NOT NULL,
  "event_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" "TriggerEvaluationOutcome" NOT NULL,
  "reason" VARCHAR(120),
  "created_occurrence_id" UUID,
  CONSTRAINT "trigger_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reminder_checklist_items_reminder_id_archived_at_position_idx" ON "reminder_checklist_items"("reminder_id", "archived_at", "position");
CREATE UNIQUE INDEX "reminder_checklist_items_active_position_key" ON "reminder_checklist_items"("reminder_id", "position") WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "occurrence_checklist_items_occurrence_id_source_item_id_key" ON "occurrence_checklist_items"("occurrence_id", "source_item_id");
CREATE INDEX "occurrence_checklist_items_occurrence_id_position_idx" ON "occurrence_checklist_items"("occurrence_id", "position");
CREATE INDEX "reminder_workflows_user_id_lifecycle_created_at_idx" ON "reminder_workflows"("user_id", "lifecycle", "created_at");
CREATE INDEX "reminder_workflows_source_reminder_id_lifecycle_idx" ON "reminder_workflows"("source_reminder_id", "lifecycle");
CREATE UNIQUE INDEX "workflow_steps_workflow_id_position_key" ON "workflow_steps"("workflow_id", "position");
CREATE UNIQUE INDEX "workflow_runs_workflow_id_source_occurrence_id_key" ON "workflow_runs"("workflow_id", "source_occurrence_id");
CREATE INDEX "workflow_runs_workflow_id_lifecycle_idx" ON "workflow_runs"("workflow_id", "lifecycle");
CREATE UNIQUE INDEX "workflow_step_runs_generated_reminder_id_key" ON "workflow_step_runs"("generated_reminder_id");
CREATE UNIQUE INDEX "workflow_step_runs_generated_occurrence_id_key" ON "workflow_step_runs"("generated_occurrence_id");
CREATE UNIQUE INDEX "workflow_step_runs_run_id_step_id_key" ON "workflow_step_runs"("run_id", "step_id");
CREATE INDEX "workflow_step_runs_run_id_lifecycle_idx" ON "workflow_step_runs"("run_id", "lifecycle");
CREATE INDEX "context_triggers_user_id_lifecycle_type_idx" ON "context_triggers"("user_id", "lifecycle", "type");
CREATE INDEX "context_triggers_reminder_id_lifecycle_idx" ON "context_triggers"("reminder_id", "lifecycle");
CREATE UNIQUE INDEX "trigger_evaluations_created_occurrence_id_key" ON "trigger_evaluations"("created_occurrence_id");
CREATE UNIQUE INDEX "trigger_evaluations_user_id_event_key_key" ON "trigger_evaluations"("user_id", "event_key");
CREATE INDEX "trigger_evaluations_trigger_id_received_at_idx" ON "trigger_evaluations"("trigger_id", "received_at");

ALTER TABLE "reminder_checklist_items" ADD CONSTRAINT "reminder_checklist_items_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "occurrence_checklist_items" ADD CONSTRAINT "occurrence_checklist_items_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "reminder_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "occurrence_checklist_items" ADD CONSTRAINT "occurrence_checklist_items_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "reminder_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reminder_workflows" ADD CONSTRAINT "reminder_workflows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_workflows" ADD CONSTRAINT "reminder_workflows_source_reminder_id_fkey" FOREIGN KEY ("source_reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "reminder_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "reminder_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_source_occurrence_id_fkey" FOREIGN KEY ("source_occurrence_id") REFERENCES "reminder_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_generated_reminder_id_fkey" FOREIGN KEY ("generated_reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_step_runs" ADD CONSTRAINT "workflow_step_runs_generated_occurrence_id_fkey" FOREIGN KEY ("generated_occurrence_id") REFERENCES "reminder_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_triggers" ADD CONSTRAINT "context_triggers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "context_triggers" ADD CONSTRAINT "context_triggers_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trigger_evaluations" ADD CONSTRAINT "trigger_evaluations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trigger_evaluations" ADD CONSTRAINT "trigger_evaluations_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "context_triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trigger_evaluations" ADD CONSTRAINT "trigger_evaluations_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "device_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trigger_evaluations" ADD CONSTRAINT "trigger_evaluations_created_occurrence_id_fkey" FOREIGN KEY ("created_occurrence_id") REFERENCES "reminder_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "context_triggers" ADD CONSTRAINT "context_triggers_shape_check" CHECK (
  ("type" IN ('LOCATION_ARRIVE', 'LOCATION_LEAVE') AND "location_ciphertext" IS NOT NULL AND "location_key_version" IS NOT NULL AND "radius_meters" IS NOT NULL AND "network_fingerprint" IS NULL)
  OR
  ("type" = 'WIFI_CONNECT' AND "location_ciphertext" IS NULL AND "location_key_version" IS NULL AND "radius_meters" IS NULL AND "network_fingerprint" IS NOT NULL)
);
