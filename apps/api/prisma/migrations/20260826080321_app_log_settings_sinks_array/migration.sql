/*
  Warnings:

  - You are about to drop the column `sink` on the `app_log_settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "app_log_settings" DROP COLUMN "sink",
ADD COLUMN     "sinks" TEXT[] DEFAULT ARRAY[]::TEXT[];
