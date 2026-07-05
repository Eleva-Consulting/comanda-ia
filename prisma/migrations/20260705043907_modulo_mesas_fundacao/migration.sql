-- CreateEnum
CREATE TYPE "StatusConta" AS ENUM ('aberta', 'aguardando_pagamento', 'fechada', 'cancelada');

-- CreateEnum
CREATE TYPE "StatusProducao" AS ENUM ('recebido', 'em_preparo', 'pronto', 'entregue', 'cancelado');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('pendente', 'confirmado', 'recusado', 'estornado');

-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "modulosAtivos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "itens_cardapio" ADD COLUMN     "setorId" TEXT;

-- CreateTable
CREATE TABLE "mesas" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "area" TEXT,
    "capacidade" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estabelecimentoId" TEXT NOT NULL,

    CONSTRAINT "mesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tempoAlvoMinutos" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estabelecimentoId" TEXT NOT NULL,

    CONSTRAINT "setores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas" (
    "id" TEXT NOT NULL,
    "status" "StatusConta" NOT NULL DEFAULT 'aberta',
    "abertaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaEm" TIMESTAMP(3),
    "mesaId" TEXT,
    "estabelecimentoId" TEXT NOT NULL,

    CONSTRAINT "contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comandas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT 'Geral',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contaId" TEXT NOT NULL,

    CONSTRAINT "comandas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_comanda" (
    "id" TEXT NOT NULL,
    "nomeItem" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnit" DECIMAL(10,2) NOT NULL,
    "observacao" TEXT,
    "status" "StatusProducao" NOT NULL DEFAULT 'recebido',
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prontoEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "comandaId" TEXT NOT NULL,
    "itemCardapioId" TEXT,
    "setorId" TEXT,
    "criadoPorUsuarioId" TEXT,

    CONSTRAINT "itens_comanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_comanda_rateio" (
    "id" TEXT NOT NULL,
    "fracao" DECIMAL(4,3) NOT NULL,
    "itemComandaId" TEXT NOT NULL,
    "comandaId" TEXT NOT NULL,

    CONSTRAINT "itens_comanda_rateio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'confirmado',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estabelecimentoId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "usuarioId" TEXT,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamento_itens" (
    "id" TEXT NOT NULL,
    "valorCoberto" DECIMAL(10,2) NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "itemComandaId" TEXT NOT NULL,

    CONSTRAINT "pagamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidadeTipo" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "motivo" TEXT,
    "dadosAntes" JSONB,
    "dadosDepois" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estabelecimentoId" TEXT NOT NULL,
    "usuarioId" TEXT,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mesas_estabelecimentoId_numero_key" ON "mesas"("estabelecimentoId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "setores_estabelecimentoId_nome_key" ON "setores"("estabelecimentoId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "itens_comanda_rateio_itemComandaId_comandaId_key" ON "itens_comanda_rateio"("itemComandaId", "comandaId");

-- CreateIndex
CREATE INDEX "log_auditoria_estabelecimentoId_criadoEm_idx" ON "log_auditoria"("estabelecimentoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "itens_cardapio" ADD CONSTRAINT "itens_cardapio_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setores" ADD CONSTRAINT "setores_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "mesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_comanda" ADD CONSTRAINT "itens_comanda_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "comandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_comanda" ADD CONSTRAINT "itens_comanda_itemCardapioId_fkey" FOREIGN KEY ("itemCardapioId") REFERENCES "itens_cardapio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_comanda" ADD CONSTRAINT "itens_comanda_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_comanda" ADD CONSTRAINT "itens_comanda_criadoPorUsuarioId_fkey" FOREIGN KEY ("criadoPorUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_comanda_rateio" ADD CONSTRAINT "itens_comanda_rateio_itemComandaId_fkey" FOREIGN KEY ("itemComandaId") REFERENCES "itens_comanda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_comanda_rateio" ADD CONSTRAINT "itens_comanda_rateio_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "comandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento_itens" ADD CONSTRAINT "pagamento_itens_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento_itens" ADD CONSTRAINT "pagamento_itens_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "pagamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamento_itens" ADD CONSTRAINT "pagamento_itens_itemComandaId_fkey" FOREIGN KEY ("itemComandaId") REFERENCES "itens_comanda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cria um setor "Cozinha" padrão para cada estabelecimento já existente
INSERT INTO "setores" ("id", "nome", "estabelecimentoId", "criadoEm")
SELECT gen_random_uuid(), 'Cozinha', "id", now()
FROM "estabelecimentos";

-- Aponta todo item de cardápio existente para o setor "Cozinha" do seu estabelecimento
UPDATE "itens_cardapio" ic
SET "setorId" = s."id"
FROM "setores" s
WHERE s."estabelecimentoId" = ic."estabelecimentoId"
  AND s."nome" = 'Cozinha'
  AND ic."setorId" IS NULL;
