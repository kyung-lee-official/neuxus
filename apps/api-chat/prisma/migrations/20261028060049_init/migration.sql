-- CreateTable
CREATE TABLE "app_users" (
    "id" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_memories" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_sessions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_messages" (
    "id" BIGSERIAL NOT NULL,
    "session_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_users_api_key_key" ON "app_users"("api_key");

-- CreateIndex
CREATE INDEX "app_memories_user_id_idx" ON "app_memories"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "app_memories_user_id_slug_key" ON "app_memories"("user_id", "slug");

-- CreateIndex
CREATE INDEX "app_messages_session_id_idx" ON "app_messages"("session_id", "created_at");

-- AddForeignKey
ALTER TABLE "app_memories" ADD CONSTRAINT "app_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_messages" ADD CONSTRAINT "app_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "app_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
