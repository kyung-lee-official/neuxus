-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "cancel_requested_at" TIMESTAMPTZ(6),
ADD COLUMN     "pending_assistant" JSONB,
ADD COLUMN     "pending_question_id" TEXT;

-- CreateTable
CREATE TABLE "agent_questions" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "tool_use_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "header" TEXT,
    "options" JSONB,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "allow_custom" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "answer" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_questions_run_id_status_idx" ON "agent_questions"("run_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_questions_run_id_tool_use_id_key" ON "agent_questions"("run_id", "tool_use_id");

-- AddForeignKey
ALTER TABLE "agent_questions" ADD CONSTRAINT "agent_questions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
