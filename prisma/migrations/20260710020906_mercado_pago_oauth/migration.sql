-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "mpAccessToken" TEXT,
ADD COLUMN     "mpConectado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mpRefreshToken" TEXT,
ADD COLUMN     "mpTokenExpiraEm" TIMESTAMP(3),
ADD COLUMN     "mpUserId" TEXT,
ADD COLUMN     "taxaPlataforma" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "aguardandoPagamento" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mpPaymentId" TEXT,
ADD COLUMN     "pagoEm" TIMESTAMP(3),
ADD COLUMN     "pixCopiaCola" TEXT,
ADD COLUMN     "pixQrCodeBase64" TEXT;
