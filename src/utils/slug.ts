import { prisma } from '../database.js';

export function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function gerarSlugUnico(base: string): Promise<string> {
  const slugBase = slugify(base);
  let candidato = slugBase;
  let tentativa = 1;
  while (true) {
    const existente = await prisma.estabelecimento.findUnique({ where: { slug: candidato } });
    if (!existente) return candidato;
    tentativa++;
    candidato = `${slugBase}-${tentativa}`;
  }
}
