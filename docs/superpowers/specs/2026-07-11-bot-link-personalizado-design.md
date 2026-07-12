# Bot personaliza o link do cardápio + mensagens atualizadas — Design

## Contexto

Depois de integrar o checkout com Mercado Pago (Pix confirmado automaticamente via webhook),
sobrou um problema real: o campo de telefone do cliente no checkout público é opcional, e boa
parte dos clientes não preenche — especialmente quando chegam por um link genérico (QR code na
mesa, post de rede social, link solto compartilhado manualmente). Sem telefone, o cliente não
recebe nem a mensagem de confirmação de pagamento nem o resumo do pedido por WhatsApp — só vê a
confirmação se mantiver a aba do navegador aberta.

Investigando o bot conversacional que já existe (`src/whatsapp.ts`), descobrimos uma oportunidade:
quando um cliente manda mensagem pro WhatsApp do estabelecimento, o bot já responde automaticamente
com o link do cardápio (`handleMensagem`) — e nesse momento o telefone do cliente já é conhecido
(vem do remetente da própria mensagem recebida pelo WhatsApp, via Baileys). Hoje esse link é
genérico (`/c/{slug}`), igual pra todo mundo. Dá pra embutir o telefone nesse link específico e
pré-preencher o campo no checkout, eliminando a fricção de digitar — para quem chega por essa via.

Ao mesmo tempo, as mensagens do bot (e a resposta a imagens recebidas) ainda fazem referência ao
fluxo antigo de "envie o comprovante aqui", que ficou obsoleto: hoje, Pix sem Mercado Pago
conectado nem aparece como opção no checkout (bloqueado com 400), e Pix com Mercado Pago conectado
confirma sozinho via webhook, sem precisar de comprovante manual. Como estamos mexendo nessas
mesmas mensagens, faz sentido corrigi-las no mesmo pacote — e remover o código morto que só
existia para dar suporte a esse fluxo antigo (`handleComprovante`, nunca chamado em nenhum lugar).

## Limitação aceita (fora de escopo)

Isso só resolve a captura automática de telefone para clientes que **iniciam a conversa pelo
WhatsApp do bot**. Se o link chegar por qualquer outro canal (QR code impresso, link solto em
rede social, compartilhamento manual), não existe forma de capturar o telefone automaticamente —
é uma limitação de privacidade do próprio WhatsApp (não repassa o número de quem abre um link pra
nenhum site), não uma lacuna de implementação. Para esses casos, o campo continua opcional e o
cliente precisa digitar manualmente, como hoje.

## Componentes

### 1. `src/whatsapp.ts` — `handleMensagem`: link com telefone embutido

Onde hoje a variável `menuLink` é montada como:
```ts
const menuLink = `${frontendUrl}/c/${estabelecimento.slug}`
```
passa a ser:
```ts
const menuLink = `${frontendUrl}/c/${estabelecimento.slug}?telefone=${foneRaw}`
```
`foneRaw` já existe na função (é o telefone do remetente, extraído do `jid` da mensagem recebida,
sem o sufixo `@s.whatsapp.net`) — só precisa ser incluído como query param. Como os três pontos de
envio de mensagem (sessão ativa, cliente recorrente, cliente novo) já leem essa mesma variável
`menuLink`, a mudança se propaga para os três automaticamente, sem duplicar código.

### 2. Mensagens do bot atualizadas (3 templates)

Os três templates que hoje terminam com uma instrução de comprovante — por exemplo:
> "Após realizar o pedido e efetuar o PIX, envie o comprovante aqui que confirmamos na hora! 😊"

passam a refletir o fluxo real (confirmação automática):
> "Depois de fazer o pedido, você recebe a confirmação automaticamente por aqui! 😊"

Aplica-se aos três casos (sessão ativa nas últimas 24h, cliente recorrente, cliente novo), cada um
mantendo sua saudação específica — só a parte final sobre comprovante muda.

### 3. Resposta a imagens recebidas

Hoje, qualquer imagem enviada ao bot (independente de contexto) recebe a resposta fixa:
> "Comprovante recebido! 📋 Nosso operador irá verificar o pagamento e confirmar seu pedido em
> breve."

Isso promete uma verificação manual que não existe mais em nenhum caminho do sistema. Passa a
responder reorientando o cliente para o fluxo real — por exemplo:
> "Para fazer um pedido, é só usar o link do cardápio que te mandei por aqui! Se já pediu, a
> confirmação chega automaticamente assim que o pagamento é processado."

### 4. `frontend/src/pages/CardapioPublico.tsx` — pré-preencher telefone a partir da URL

Ao carregar a página, lê o parâmetro `telefone` da URL (`useSearchParams` ou
`window.location.search`), se presente. Formata para exibição — remove o prefixo `55` (código do
país, sempre presente no formato que o WhatsApp/Baileys entrega) e insere um espaço após o DDD
(2 dígitos), no mesmo estilo do placeholder já usado no campo (`85 99999-9999`). Usa esse valor
como estado inicial de `clienteFone` (`useState(() => ...)` para calcular uma vez, na montagem).
O campo continua com o mesmo comportamento de hoje: editável, opcional, sem máscara de input.

Não precisa de validação de formato adicional — o backend já normaliza o telefone de forma
tolerante (`enviarMensagem` em `whatsapp.ts` remove tudo que não é dígito e prefixa `55` se
ausente), então qualquer formatação razoável de exibição funciona sem mudança no backend.

### 5. Remoção de código morto

Remove `handleComprovante` (função inteira, ~95 linhas), `validarComprovanteIA` (validação de
comprovante Pix via IA/Claude Haiku) e `nomesBatem` (helper de comparação fuzzy de nomes) —
nenhuma delas é chamada de nenhum lugar do código hoje (confirmado em revisão anterior desta
sessão), e ficaram conceitualmente obsoletas: dependiam do fluxo antigo de pagamento manual por
chave Pix + comprovante, que não existe mais em nenhum caminho do checkout atual. A dependência
`@anthropic-ai/sdk`, usada só por `validarComprovanteIA`, também deixa de ser necessária neste
arquivo — mas a remoção da dependência do `package.json` fica fora de escopo deste pacote (pode
ser usada em outro lugar do projeto; checar antes de remover é tarefa separada).

## Testes

- `src/whatsapp.ts` não tem testes automatizados hoje (é um módulo com estado de conexão/socket,
  sem infraestrutura de teste para isso no projeto). A verificação será manual: mandar mensagem
  pro bot de um número de teste e conferir que o link retornado contém `?telefone=` com os dígitos
  corretos, e que as mensagens não mencionam mais comprovante.
- `CardapioPublico.tsx`: adicionar verificação manual (ou teste, se o projeto já tiver
  infraestrutura de teste de componente React — checar durante o planejamento) de que acessar a
  página com `?telefone=5585991152680` pré-preenche o campo como `85 991152680`, e que o campo
  continua editável e o submit funciona normalmente com o valor alterado.

## Fora de escopo

- Capturar telefone quando o link chega por qualquer canal que não seja o bot conversacional
  (ver "Limitação aceita" acima).
- Remover a dependência `@anthropic-ai/sdk` do `package.json` (checar outros usos antes).
- Qualquer mudança no fluxo de pagamento em si (Mercado Pago, dinheiro, etc.) — este pacote mexe
  só em mensagens de bot e pré-preenchimento de formulário.
