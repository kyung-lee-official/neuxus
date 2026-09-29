/*
  Warnings:

  - The primary key for the `kb_retrieve_settings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `knowledge_base_id` on the `kb_retrieve_settings` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "kb_retrieve_settings" DROP CONSTRAINT "kb_retrieve_settings_knowledge_base_id_fkey";

-- AlterTable
ALTER TABLE "kb_retrieve_settings" DROP CONSTRAINT "kb_retrieve_settings_pkey",
DROP COLUMN "knowledge_base_id",
ADD COLUMN     "id" TEXT NOT NULL DEFAULT 'default',
ADD CONSTRAINT "kb_retrieve_settings_pkey" PRIMARY KEY ("id");
