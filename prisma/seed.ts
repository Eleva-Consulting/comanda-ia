import { prisma } from '../src/database.js'
import bcrypt from 'bcrypt'

async function main() {
  console.log('🌱 Iniciando seed...')

  // Limpa dados antigos — ordem importa por causa de FKs
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

  // Estabelecimento 1: Galeteria do Vinícius
  // ID fixo pra preservar referências que você usava
  const galeteria = await prisma.estabelecimento.create({
    data: {
      id: '5619f2a5-dbc2-4dfc-ab38-6c537eada941',
      nome: 'Galeteria do Vinícius',
      telefone: '85999999999',
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
          {
            nome: 'Galeto Inteiro',
            descricao: 'Acompanha arroz, farofa e vinagrete',
            preco: 45.0,
            disponivel: true,
          },
          {
            nome: 'Galeto + Refrigerante',
            descricao: 'Galeto inteiro com refrigerante 600ml',
            preco: 52.0,
            disponivel: true,
          },
        ],
      },
    },
  })
  console.log(`✅ ${galeteria.nome} (id: ${galeteria.id})`)

  // Estabelecimento 2: Pizzaria do Bairro
  const pizzaria = await prisma.estabelecimento.create({
    data: {
      nome: 'Pizzaria do Bairro',
      telefone: '85988888888',
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
          {
            nome: 'Pizza Margherita',
            descricao: 'Molho, mussarela e manjericão fresco',
            preco: 38.0,
            disponivel: true,
          },
        ],
      },
    },
  })
  console.log(`✅ ${pizzaria.nome} (id: ${pizzaria.id})`)

  console.log('\n🎉 Seed concluído!')
  console.log('\n📋 Credenciais de teste:')
  console.log('  vinicius@teste.com / senhaforte123')
  console.log('  carlos@teste.com   / outrasenha123')
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })