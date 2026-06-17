-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito');

-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "chavePix" TEXT;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "formaPagamento" "FormaPagamento" NOT NULL DEFAULT 'pix';
