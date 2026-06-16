-- Adiciona SUPER_ADMIN ao enum Role
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- Torna estabelecimentoId opcional em usuarios (SUPER_ADMIN não tem tenant)
ALTER TABLE "usuarios" ALTER COLUMN "estabelecimentoId" DROP NOT NULL;
