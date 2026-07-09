-- CreateEnum
CREATE TYPE "UnidadeMedida" AS ENUM ('g', 'kg', 'ml', 'l', 'un');

-- CreateEnum
CREATE TYPE "TipoMovimentacaoEstoque" AS ENUM ('entrada', 'saida_perda', 'ajuste', 'consumo_diario');

-- CreateTable
CREATE TABLE "insumos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" "UnidadeMedida" NOT NULL,
    "custoUnitario" DECIMAL(10,4) NOT NULL,
    "estoqueAtual" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estabelecimentoId" TEXT NOT NULL,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentacaoEstoque" NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "custoUnitarioSnapshot" DECIMAL(10,4) NOT NULL,
    "data" DATE NOT NULL,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "insumoId" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "usuarioId" TEXT,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insumos_estabelecimentoId_nome_key" ON "insumos"("estabelecimentoId", "nome");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_estabelecimentoId_data_idx" ON "movimentacoes_estoque"("estabelecimentoId", "data");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_estabelecimentoId_tipo_data_idx" ON "movimentacoes_estoque"("estabelecimentoId", "tipo", "data");

-- AddForeignKey
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
