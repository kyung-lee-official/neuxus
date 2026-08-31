-- AlterTable
ALTER TABLE "app_log" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "app_log_user_id_created_at_idx" ON "app_log"("user_id", "created_at" DESC);
