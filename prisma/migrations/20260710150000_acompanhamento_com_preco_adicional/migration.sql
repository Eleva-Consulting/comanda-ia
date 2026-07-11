-- Converte opcoesAcompanhamento de text[] pra jsonb (permite {nome, precoAdicional}
-- por opção). Coluna criada na migration anterior, ainda sem uso real — sem
-- necessidade de preservar dados, todas as linhas estão em '{}'.
ALTER TABLE "categorias" ALTER COLUMN "opcoesAcompanhamento" DROP DEFAULT;
ALTER TABLE "categorias" ALTER COLUMN "opcoesAcompanhamento" TYPE JSONB USING '[]'::jsonb;
ALTER TABLE "categorias" ALTER COLUMN "opcoesAcompanhamento" SET DEFAULT '[]';
