-- CreateEnum
CREATE TYPE "StatusConversa" AS ENUM ('ativa', 'finalizada');

-- CreateEnum
CREATE TYPE "PapelMensagem" AS ENUM ('cliente', 'assistente');

-- CreateTable
CREATE TABLE "conversas" (
    "id" TEXT NOT NULL,
    "clienteFone" TEXT NOT NULL,
    "clienteNome" TEXT,
    "status" "StatusConversa" NOT NULL DEFAULT 'ativa',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" TEXT NOT NULL,
    "papel" "PapelMensagem" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversaId" TEXT NOT NULL,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
