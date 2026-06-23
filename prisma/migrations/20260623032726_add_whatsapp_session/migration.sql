-- CreateTable
CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "creds" JSONB,
    "keys" JSONB NOT NULL DEFAULT '{}',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_sessions_estabelecimentoId_key" ON "whatsapp_sessions"("estabelecimentoId");

-- AddForeignKey
ALTER TABLE "whatsapp_sessions" ADD CONSTRAINT "whatsapp_sessions_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
