-- CreateTable
CREATE TABLE "rascunho_itens_comanda" (
    "id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "observacao" TEXT,
    "acompanhamento" TEXT,
    "comandaId" TEXT NOT NULL,
    "itemCardapioId" TEXT NOT NULL,
    "criadoPorUsuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rascunho_itens_comanda_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "rascunho_itens_comanda" ADD CONSTRAINT "rascunho_itens_comanda_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "comandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rascunho_itens_comanda" ADD CONSTRAINT "rascunho_itens_comanda_itemCardapioId_fkey" FOREIGN KEY ("itemCardapioId") REFERENCES "itens_cardapio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rascunho_itens_comanda" ADD CONSTRAINT "rascunho_itens_comanda_criadoPorUsuarioId_fkey" FOREIGN KEY ("criadoPorUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
