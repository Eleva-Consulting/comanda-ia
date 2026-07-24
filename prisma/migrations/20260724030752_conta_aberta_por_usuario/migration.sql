-- AlterTable
ALTER TABLE "contas" ADD COLUMN     "abertaPorUsuarioId" TEXT;

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_abertaPorUsuarioId_fkey" FOREIGN KEY ("abertaPorUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
