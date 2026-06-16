-- DropForeignKey
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_estabelecimentoId_fkey";

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiracao" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
