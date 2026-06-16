-- Cria o enum StatusEstabelecimento
CREATE TYPE "StatusEstabelecimento" AS ENUM ('pendente', 'ativo', 'suspenso');

-- Adiciona coluna status como opcional primeiro
ALTER TABLE "estabelecimentos" ADD COLUMN "status" "StatusEstabelecimento";

-- Migra dados: ativo=true → ativo, ativo=false → suspenso
UPDATE "estabelecimentos" SET "status" = 'ativo'    WHERE "ativo" = true;
UPDATE "estabelecimentos" SET "status" = 'suspenso' WHERE "ativo" = false;

-- Torna a coluna obrigatória com default pendente
ALTER TABLE "estabelecimentos" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "estabelecimentos" ALTER COLUMN "status" SET DEFAULT 'pendente';

-- Remove coluna ativo que foi substituída
ALTER TABLE "estabelecimentos" DROP COLUMN "ativo";
