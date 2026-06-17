-- CreateEnum
CREATE TYPE "TipoEntrega" AS ENUM ('entrega', 'retirada');

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "tipoEntrega" "TipoEntrega" NOT NULL DEFAULT 'entrega';
