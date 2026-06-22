-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "evolutionToken" TEXT,
ADD COLUMN     "evolutionUrl" TEXT,
ADD COLUMN     "taxaEntrega" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "itens_cardapio" ADD COLUMN     "estoque" INTEGER;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "avaliacao" INTEGER,
ADD COLUMN     "comentarioAvaliacao" TEXT;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "permissoes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
