-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "precisaTroco" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trocoPara" DECIMAL(10,2);
