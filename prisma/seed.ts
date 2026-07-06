import { prisma } from '../src/database.js'
import bcrypt from 'bcrypt'

async function main() {
  console.log('🌱 Iniciando seed...')

  await prisma.mensagem.deleteMany()
  await prisma.conversa.deleteMany()
  await prisma.pagamentoItem.deleteMany()
  await prisma.pagamento.deleteMany()
  await prisma.itemComandaRateio.deleteMany()
  await prisma.itemComanda.deleteMany()
  await prisma.comanda.deleteMany()
  await prisma.conta.deleteMany()
  await prisma.mesa.deleteMany()
  await prisma.logAuditoria.deleteMany()
  await prisma.itemPedido.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.itemCardapio.deleteMany()
  await prisma.setor.deleteMany()
  await prisma.usuario.deleteMany()
  await prisma.estabelecimento.deleteMany()
  console.log('🗑️  Dados anteriores limpos')

  // ── Super Admin da plataforma ─────────────────────────────────────────────
  const senhaSuperAdmin = await bcrypt.hash('superadmin123', 12)
  await prisma.usuario.create({
    data: {
      nome: 'Super Admin',
      email: 'admin@comanda-ia.dev',
      senhaHash: senhaSuperAdmin,
      role: 'SUPER_ADMIN',
      estabelecimentoId: null,
    },
  })
  console.log('✅ Super Admin criado (admin@comanda-ia.dev)')

  // ── Estabelecimentos de teste (já ativos) ─────────────────────────────────
  const senhaVinicius = await bcrypt.hash('senhaforte123', 12)
  const senhaCarlos   = await bcrypt.hash('outrasenha123', 12)

  const galeteria = await prisma.estabelecimento.create({
    data: {
      id: '5619f2a5-dbc2-4dfc-ab38-6c537eada941',
      nome: 'Galeteria do Vinícius',
      telefone: '85999999999',
      slug: 'galeteria-do-vinicius',
      status: 'ativo',
      usuarios: {
        create: {
          nome: 'Vinícius',
          email: 'vinicius@teste.com',
          senhaHash: senhaVinicius,
          role: 'DONO',
        },
      },
      itens: {
        create: [
          { nome: 'Galeto Inteiro', descricao: 'Acompanha arroz, farofa e vinagrete', preco: 45.0, disponivel: true },
          { nome: 'Galeto + Refrigerante', descricao: 'Galeto inteiro com refrigerante 600ml', preco: 52.0, disponivel: true },
        ],
      },
    },
  })
  console.log(`✅ ${galeteria.nome} (slug: ${galeteria.slug})`)

  const pizzaria = await prisma.estabelecimento.create({
    data: {
      nome: 'Pizzaria do Bairro',
      telefone: '85988888888',
      slug: 'pizzaria-do-bairro',
      status: 'ativo',
      usuarios: {
        create: {
          nome: 'Carlos',
          email: 'carlos@teste.com',
          senhaHash: senhaCarlos,
          role: 'DONO',
        },
      },
      itens: {
        create: [
          { nome: 'Pizza Margherita', descricao: 'Molho, mussarela e manjericão fresco', preco: 38.0, disponivel: true },
        ],
      },
    },
  })
  console.log(`✅ ${pizzaria.nome} (slug: ${pizzaria.slug})`)

  // ── Setor padrão para os estabelecimentos de teste ────────────────────────
  const setorCozinhaGaleteria = await prisma.setor.create({
    data: { nome: 'Cozinha', estabelecimentoId: galeteria.id },
  })
  await prisma.itemCardapio.updateMany({
    where: { estabelecimentoId: galeteria.id },
    data:  { setorId: setorCozinhaGaleteria.id },
  })

  const setorCozinhaPizzaria = await prisma.setor.create({
    data: { nome: 'Cozinha', estabelecimentoId: pizzaria.id },
  })
  await prisma.itemCardapio.updateMany({
    where: { estabelecimentoId: pizzaria.id },
    data:  { setorId: setorCozinhaPizzaria.id },
  })

  // ── Pizzaria é o estabelecimento de referência para o módulo de mesas ─────
  await prisma.estabelecimento.update({
    where: { id: pizzaria.id },
    data:  { modulosAtivos: ['mesas'] },
  })
  console.log('✅ Módulo "mesas" habilitado na Pizzaria do Bairro (estabelecimento de teste)')

  // ── Estabelecimento pendente (simula um signup aguardando aprovação) ───────
  const senhaTeste = await bcrypt.hash('teste123456', 12)
  const hamburgueria = await prisma.estabelecimento.create({
    data: {
      nome: 'Hamburgueria do João',
      telefone: '85977777777',
      slug: 'hamburgueria-do-joao',
      status: 'pendente',
      usuarios: {
        create: {
          nome: 'João',
          email: 'joao@teste.com',
          senhaHash: senhaTeste,
          role: 'DONO',
        },
      },
    },
  })
  console.log(`⏳ ${hamburgueria.nome} (pendente — aguardando aprovação)`)

  // ── Setor padrão para a hamburgueria (sem itens de cardápio ainda) ────────
  await prisma.setor.create({
    data: { nome: 'Cozinha', estabelecimentoId: hamburgueria.id },
  })

  console.log('\n🎉 Seed concluído!')
  console.log('\nCredenciais:')
  console.log('  Super Admin  → admin@comanda-ia.dev  / superadmin123')
  console.log('  Galeteria    → vinicius@teste.com    / senhaforte123')
  console.log('  Pizzaria     → carlos@teste.com      / outrasenha123')
  console.log('  Hamburgueria → joao@teste.com        / teste123456  (pendente)')
}

main()
  .catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
