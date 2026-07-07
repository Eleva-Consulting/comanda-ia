-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "setorId" TEXT;

-- CreateIndex
CREATE INDEX "itens_comanda_setorId_status_idx" ON "itens_comanda"("setorId", "status");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
