-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "bairroNome" TEXT,
ADD COLUMN     "taxaEntrega" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "bairros" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "taxaEntrega" DECIMAL(10,2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estabelecimentoId" TEXT NOT NULL,

    CONSTRAINT "bairros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bairros_estabelecimentoId_nome_key" ON "bairros"("estabelecimentoId", "nome");

-- AddForeignKey
ALTER TABLE "bairros" ADD CONSTRAINT "bairros_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
