-- CreateEnum
CREATE TYPE "OrigemPedido" AS ENUM ('balcao', 'publico');

-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "imprimirAutomaticoBalcao" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "senhaReabrirPedido" TEXT;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "origem" "OrigemPedido" NOT NULL DEFAULT 'publico';
