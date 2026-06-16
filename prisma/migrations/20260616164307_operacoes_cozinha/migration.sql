-- AlterEnum
ALTER TYPE "StatusPedido" ADD VALUE 'a_caminho';

-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "aceitandoPedidos" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "itens_pedido" ADD COLUMN     "observacao" TEXT;
