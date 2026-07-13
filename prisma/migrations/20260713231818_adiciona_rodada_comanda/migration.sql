-- AlterTable
ALTER TABLE "itens_comanda" ADD COLUMN     "rodadaId" TEXT;

-- CreateTable
CREATE TABLE "rodadas_comanda" (
    "id" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comandaId" TEXT NOT NULL,
    "criadoPorUsuarioId" TEXT,

    CONSTRAINT "rodadas_comanda_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "rodadas_comanda" ADD CONSTRAINT "rodadas_comanda_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "comandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rodadas_comanda" ADD CONSTRAINT "rodadas_comanda_criadoPorUsuarioId_fkey" FOREIGN KEY ("criadoPorUsuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_comanda" ADD CONSTRAINT "itens_comanda_rodadaId_fkey" FOREIGN KEY ("rodadaId") REFERENCES "rodadas_comanda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
