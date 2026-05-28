# 08 — Integração com IA: padrão Adapter, conversação e tool use

Este documento consolida o aprendizado sobre integrar um serviço externo de IA (Claude API) usando o padrão Adapter, persistir conversas, e o conceito de tool use que permite a IA agir, não só conversar.

## O problema: integrar serviços externos sem acoplar

Quando um sistema depende de um serviço externo (IA, gateway de pagamento, envio de email), surge um risco: espalhar chamadas diretas a esse serviço por todo o código. Se um dia for preciso trocar o provedor, a mudança vira uma caçada por todas as chamadas espalhadas.

A solução é o **padrão Adapter**: isolar a dependência externa atrás de uma interface. O resto do sistema fala com a interface, nunca com o serviço diretamente.

## Padrão Adapter

Uma **interface** define um contrato — o que algo precisa fazer, sem dizer como. Várias implementações podem cumprir o mesmo contrato.

```typescript
// O contrato
export interface ProvedorIA {
  responder(
    mensagens: MensagemIA[],
    contexto: ContextoEstabelecimento
  ): Promise<RespostaIA>;
}
```

No projeto, esse contrato tem (ao menos) duas implementações:

| Implementação | O que faz | Quando usa |
|---|---|---|
| `MockProvedorIA` | Respostas simuladas por palavra-chave (sem API, sem custo) | Desenvolvimento, testes |
| `ClaudeProvedorIA` | Chama a Claude API de verdade | Produção |

A classe declara que cumpre o contrato com `implements`:

```typescript
export class MockProvedorIA implements ProvedorIA {
  async responder(...): Promise<RespostaIA> { ... }
}
```

Se a classe não implementar o método exigido, ou usar assinatura errada, o TypeScript não compila. O contrato é garantido em tempo de compilação.

## Programar contra a interface, não a implementação

O resto do sistema declara a dependência pelo **tipo da interface**, não da implementação concreta:

```typescript
const provedorIA: ProvedorIA = new MockProvedorIA();
```

O webhook usa `provedorIA.responder(...)` sem saber qual implementação está rodando. Trocar o cérebro é mudar uma linha:

```typescript
// Desenvolvimento
const provedorIA: ProvedorIA = new MockProvedorIA();

// Produção
const provedorIA: ProvedorIA = new ClaudeProvedorIA();
```

Esse princípio (chamado *dependency inversion*) é a base de código testável e flexível. Vale para qualquer dependência externa: pagamento, email, storage.

## Desenvolvimento com mock

O `MockProvedorIA` permite construir e testar todo o fluxo sem depender do serviço real estar disponível ou custar dinheiro. Ele não precisa ser inteligente — só plausível o suficiente pra exercitar o pipeline.

Benefício extra: o mock não é descartado quando o serviço real entra. Ele vira **ferramenta de teste permanente** — testes automatizados podem usar o mock pra validar a lógica do sistema sem gastar com API real a cada execução.

Limitação esperada: o mock não entende linguagem natural. Por exemplo, ele preenche `clienteNome` com um valor fixo ("Cliente (mock)") porque não consegue extrair o nome real da conversa. O cérebro real resolve isso perguntando ou extraindo do histórico.

## Persistir conversa: por que e como

A IA precisa de **contexto**. "Quero 2" só faz sentido sabendo o que veio antes. Por isso o histórico da conversa é persistido em dois modelos:

```prisma
model Conversa {
  id           String         @id @default(uuid())
  clienteFone  String
  clienteNome  String?
  status       StatusConversa @default(ativa)
  criadoEm     DateTime       @default(now())
  atualizadoEm DateTime       @updatedAt

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  mensagens Mensagem[]

  @@map("conversas")
}

model Mensagem {
  id       String        @id @default(uuid())
  papel    PapelMensagem
  conteudo String
  criadoEm DateTime      @default(now())

  conversaId String
  conversa   Conversa @relation(fields: [conversaId], references: [id], onDelete: Cascade)

  @@map("mensagens")
}
```

Decisões:

- **Conversa por `clienteFone` + `estabelecimentoId`**: cada cliente tem uma conversa com cada estabelecimento. Multi-tenant aplicado.
- **`status` (ativa/finalizada)**: quando o pedido fecha, a conversa é finalizada. A próxima mensagem do cliente inicia uma conversa nova.
- **`Mensagem.papel` (cliente/assistente)**: mapeia direto pro formato da Claude API (`role: 'user' | 'assistant'`).
- **`onDelete: Cascade`**: deletar a conversa apaga as mensagens junto, sem órfãos.

## Pedido com itens: snapshot vs referência viva

Pra registrar um pedido completo, criamos `ItemPedido`:

```prisma
model ItemPedido {
  id         String  @id @default(uuid())
  nomeItem   String
  quantidade Int
  precoUnit  Decimal @db.Decimal(10, 2)

  pedidoId String
  pedido   Pedido @relation(fields: [pedidoId], references: [id], onDelete: Cascade)

  @@map("itens_pedido")
}
```

Decisão central: o item do pedido guarda **nome e preço no momento da compra** (snapshot), não um link vivo pro `ItemCardapio`.

Por quê? Se o item do pedido só apontasse pro cardápio, e o dono mudasse o preço amanhã, os pedidos antigos passariam a mostrar o preço novo — alterando o histórico financeiro retroativamente. Isso é errado. Dados transacionais (pedidos, notas fiscais, faturas) sempre guardam os valores no momento da transação.

## Tool use: a IA que age

Tool use (ou function calling) é o mecanismo que permite a IA executar ações, não só responder texto.

Como funciona com a Claude API:

1. Você define ferramentas — funções que a IA pode chamar, com nome, descrição e schema de parâmetros
2. Envia as ferramentas junto com as mensagens
3. Em vez de texto, a IA pode responder com um `tool_use`: "quero chamar `registrar_pedido` com esses parâmetros"
4. Seu código executa a função de verdade
5. O resultado volta pra IA
6. A IA responde ao cliente

É um loop, e o controle é seu: a IA não toca no banco, ela só pede pra você executar ações que você definiu.

No projeto, isso foi representado de forma simplificada: a `RespostaIA` ganhou um campo opcional `pedidoParaRegistrar`. Quando presente, o webhook executa a ação (cria o pedido). O Claude real usará o mecanismo de tool use completo, mas o encanamento (IA decide → sistema executa → persiste) já está construído.

```typescript
export interface RespostaIA {
  texto: string;
  pedidoParaRegistrar?: PedidoParaRegistrar; // a "ação"
}
```

## O fluxo do webhook

O endpoint que amarra tudo executa em sequência:

1. Verifica o estabelecimento e carrega o cardápio
2. Busca conversa ativa ou cria uma nova
3. Salva a mensagem do cliente
4. Carrega o histórico completo
5. Monta o contexto (nome + cardápio, com preço convertido de Decimal pra number)
6. Traduz as mensagens pro formato da IA
7. Chama `provedorIA.responder(...)`
8. Se veio uma ação, executa (cria pedido + itens via nested write)
9. Salva a resposta da IA
10. Devolve

O webhook não sabe qual cérebro está rodando — só fala com a interface.

## Decisão de produto: desenvolver sem a API

Quando o crédito da API não está disponível, o mock permite avançar em toda a estrutura sem gastar nada. A troca pelo provedor real é uma linha. Essa é a demonstração prática do valor do padrão Adapter: a limitação externa (sem crédito) não bloqueia o desenvolvimento interno.

## Conversão Decimal → number

O Prisma retorna campos `Decimal` como objeto especial, não número JavaScript. Ao montar o contexto pra IA, converte-se com `Number(item.preco)`. Decimal é usado no banco pela precisão (dinheiro), mas o domínio da aplicação trabalha com number.

## Modelos da Claude API (referência)

Os modelos atuais incluem `claude-opus-4-7` (mais capaz), `claude-sonnet-4-6` (equilíbrio) e `claude-haiku-4-5` (rápido, econômico). Para atendimento em tempo real, alto volume e custo sensível, o Haiku é o alvo ideal. Em produção, usa-se sempre a versão pinada (com data), nunca o alias.

O SDK é o `@anthropic-ai/sdk`, que já vem com tipos TypeScript embutidos. A API key fica em variável de ambiente (`ANTHROPIC_API_KEY`) e a API é paga por uso, separada da assinatura do claude.ai.

## Próximos tópicos

- 09 — WebSockets e tempo real com Socket.IO
- 10 — Frontend React (painel do dono e tela da cozinha)
- 11 — Integração com Claude API real (substituindo o mock)
- 12 — Integração com WhatsApp via Evolution API
- 13 — Integração com Mercado Pago (PIX)