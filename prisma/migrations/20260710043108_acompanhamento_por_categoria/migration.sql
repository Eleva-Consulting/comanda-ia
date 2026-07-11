-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "opcoesAcompanhamento" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "itens_comanda" ADD COLUMN     "acompanhamento" TEXT;

-- AlterTable
ALTER TABLE "itens_pedido" ADD COLUMN     "acompanhamento" TEXT;
