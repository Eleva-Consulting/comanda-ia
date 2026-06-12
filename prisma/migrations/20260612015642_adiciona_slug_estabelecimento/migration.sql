/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `estabelecimentos` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `estabelecimentos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "estabelecimentos_slug_key" ON "estabelecimentos"("slug");
