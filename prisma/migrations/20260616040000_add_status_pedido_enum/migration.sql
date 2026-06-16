-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('recebido', 'em_preparo', 'pronto', 'entregue', 'cancelado');

-- AlterTable — preserva dados existentes via USING cast
ALTER TABLE "pedidos" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "pedidos" ALTER COLUMN "status" TYPE "StatusPedido" USING "status"::"StatusPedido";
ALTER TABLE "pedidos" ALTER COLUMN "status" SET DEFAULT 'recebido'::"StatusPedido";
