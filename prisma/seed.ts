import { prisma } from '../src/database.js'
import bcrypt from 'bcrypt'

async function main() {
  console.log('🌱 Iniciando seed...')

  await prisma.mensagem.deleteMany()
  await prisma.conversa.deleteMany()
  await prisma.itemPedido.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.itemCardapio.deleteMany()
  await prisma.usuario.deleteMany()
  await prisma.estabelecimento.deleteMany()
  console.log('🗑️  Dados anteriores limpos')

  const senhaVinicius = await bcrypt.hash('senhaforte123', 12)
  const senhaCarlos = await bcrypt.hash('outrasenha123', 12)

  const galeteria = await prisma.estabelecimento.create({
    data: {
      id: '5619f2a5-dbc2-4dfc-ab38-6c537eada941',
      nome: 'Galeteria do Vinícius',
      telefone: '85999999999',
      slug: 'galeteria-do-vinicius',
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

  console.log('\n🎉 Seed concluído!')
}

main()
  .catch((e) => { console.error('❌ Erro no seed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })