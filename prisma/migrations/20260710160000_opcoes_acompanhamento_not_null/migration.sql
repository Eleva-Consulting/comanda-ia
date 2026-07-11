-- Ajuste de drift: a migration anterior (conversão pra jsonb) não reafirmou
-- NOT NULL explicitamente. Seguro — toda linha já tem '[]' ou um array válido.
ALTER TABLE "categorias" ALTER COLUMN "opcoesAcompanhamento" SET NOT NULL;
