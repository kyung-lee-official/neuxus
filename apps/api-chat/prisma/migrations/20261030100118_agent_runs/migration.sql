-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "message" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "messages" JSONB NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "answer" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_events" (
    "id" BIGSERIAL NOT NULL,
    "run_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_status_created_at_idx" ON "agent_runs"("status", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_user_id_created_at_idx" ON "agent_runs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_user_idempotency_key" ON "agent_runs"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "agent_events_run_id_seq_idx" ON "agent_events"("run_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "agent_events_run_id_seq_key" ON "agent_events"("run_id", "seq");

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "app_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
