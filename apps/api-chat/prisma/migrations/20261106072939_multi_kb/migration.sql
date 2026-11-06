/*
  Warnings:

  - You are about to drop the column `knowledge_base_id` on the `agent_runs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "agent_runs" DROP COLUMN "knowledge_base_id",
ADD COLUMN     "knowledge_base_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
