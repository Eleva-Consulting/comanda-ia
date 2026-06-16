import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

function obterCliente(): S3Client {
  const accountId       = process.env.R2_ACCOUNT_ID;
  const accessKeyId     = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 não configurado. Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY.');
  }

  return new S3Client({
    region:      'auto',
    endpoint:    `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function r2Configurado(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

export async function uploadParaR2(
  chave: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  await obterCliente().send(
    new PutObjectCommand({
      Bucket:      process.env.R2_BUCKET_NAME!,
      Key:         chave,
      Body:        buffer,
      ContentType: contentType,
    }),
  );
  return `${process.env.R2_PUBLIC_URL}/${chave}`;
}

export async function deletarDeR2(url: string): Promise<void> {
  try {
    const chave = new URL(url).pathname.slice(1);
    await obterCliente().send(
      new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: chave }),
    );
  } catch {
    // Arquivo pode já não existir — sem impacto
  }
}
