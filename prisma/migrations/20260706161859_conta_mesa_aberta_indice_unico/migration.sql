-- Garante que uma mesa não pode ter duas Contas abertas simultaneamente.
-- Prisma não suporta índice único parcial (@@unique com filtro) na schema language,
-- então esta constraint só existe aqui na migration, não em prisma/schema.prisma.
-- Fecha a janela de corrida entre o findFirst e o create em POST /contas.
CREATE UNIQUE INDEX "contas_mesa_aberta_unica" ON "contas" ("mesaId")
WHERE status IN ('aberta', 'aguardando_pagamento');
