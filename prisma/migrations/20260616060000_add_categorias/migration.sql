-- CreateTable: categorias
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "estabelecimentoId" TEXT NOT NULL,
    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: categorias → estabelecimentos
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_estabelecimentoId_fkey"
    FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: itens_cardapio (add categoriaId nullable)
ALTER TABLE "itens_cardapio" ADD COLUMN "categoriaId" TEXT;

-- AddForeignKey: itens_cardapio → categorias (SET NULL on delete)
ALTER TABLE "itens_cardapio" ADD CONSTRAINT "itens_cardapio_categoriaId_fkey"
    FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
