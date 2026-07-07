# Módulo de Mesas — Fase 1d (Produção multi-setor / Kanban) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à cozinha/produção uma tela de Kanban (Recebido / Em preparo / Pronto) com um card por
item de `ItemComanda`, filtrada pelo setor do operador logado, com atualização em tempo real via
Socket.IO escopado por setor — sem alterar a tela de Cozinha existente (que continua servindo
balcão/delivery sem nenhuma mudança).

**Architecture:** Operadores ganham um `setorId` opcional (definido pelo DONO em Configurações de
Operadores). Esse `setorId` viaja no JWT, junto com `estabelecimentoId`/`role`/`permissoes` que já
existem. A nova tela `/producao` busca itens via `GET /producao/itens` (filtrado por setor do usuário,
ou todos os setores se ele não tiver um fixo) e escuta dois eventos novos (`producao:item-novo`,
`producao:item-atualizado`) emitidos pelo backend nas mesmas rotas que já existem em `contas.ts`
(criar item, mudar status, transferir). Para reduzir tráfego de socket em escala, a conexão dedicada
dessa tela nova se anuncia com `contexto: 'producao'` ao conectar — o servidor então a coloca numa
sala específica do setor (`estabelecimentoId:setorId`) em vez da sala ampla do estabelecimento.
Todas as outras conexões (Layout, Cozinha, Mesas da Fase 1c) continuam entrando na sala ampla
exatamente como hoje — nada nelas muda.

**Tech Stack:** Node 22 + TypeScript + Fastify 5 + Prisma 7 + PostgreSQL + Socket.IO (backend);
React 19 + Vite + Tailwind + React Router 7 + socket.io-client (frontend); Vitest para as partes
críticas (lógica pura de salas/filtro).

## Global Constraints

- TypeScript strict, sem `any` implícito, sem `@ts-ignore`.
- Mobile first — Tailwind sem prefixo é mobile, `sm:`/`md:`/`lg:` é telas maiores.
- Arquivos completos nas edições — nunca entregar trechos parciais.
- Sem `console.log` (use `console.error` só em blocos catch, seguindo o padrão já usado no projeto).
- **A tela de Produção só aparece pra quem tem a permissão `mesas` E o estabelecimento tem o módulo
  `"mesas"` ativo** — reaproveita exatamente a mesma checagem dupla já usada em `/mesas` (Fase 1c),
  não cria uma permissão nova.
- **Nenhuma mudança na tela de Cozinha (`frontend/src/pages/Cozinha.tsx`) ou nas rotas de `Pedido`/
  `ItemPedido`** — essa fase cobre só `ItemComanda` (mesas). Unificar com balcão/delivery fica pra uma
  fase futura, fora deste plano.
- **Toda mudança em `src/socket.ts` e nas rotas de `contas.ts` deve ser aditiva** — nenhuma conexão
  ou evento já existente (Layout, Cozinha, Mesas da Fase 1c) pode mudar de comportamento. Isso é
  verificado explicitamente no self-review de cada task que toca esses arquivos.
- Migrations do Prisma: usar `npx prisma migrate dev --name <nome>` a partir da raiz do projeto,
  contra o Postgres local do `docker compose` (nenhuma constraint manual/SQL cru é necessária nesta
  fase — só campo novo + índice, ambos suportados nativamente pela sintaxe do schema).

---

### Task 1: Schema — `Usuario.setorId` + índice de produção em `ItemComanda`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: nova migration (gerada pelo Prisma)

**Interfaces:**
- Produces: campo `Usuario.setorId: String | null` e relação `Usuario.setor: Setor | null`; campo
  `Setor.usuarios: Usuario[]` (relação inversa); índice composto `ItemComanda(setorId, status)` usado
  pela query de produção da Task 5.

- [ ] **Step 1: Editar `prisma/schema.prisma` — adicionar `setorId` em `Usuario`**

No model `Usuario` (linhas 139-160 hoje), adicionar o campo e a relação logo após `estabelecimento`:

```prisma
model Usuario {
  id        String   @id @default(uuid())
  email     String   @unique
  senhaHash String
  nome      String
  role      Role     @default(DONO)
  criadoEm  DateTime @default(now())

  permissoes           String[]  @default([])
  resetToken           String?   @unique
  resetTokenExpiracao  DateTime?

  estabelecimentoId String?
  estabelecimento   Estabelecimento?   @relation(fields: [estabelecimentoId], references: [id])

  setorId String?
  setor   Setor?  @relation(fields: [setorId], references: [id])

  pushSubscriptions PushSubscription[]
  itensComandaCriados ItemComanda[]
  pagamentosRegistrados Pagamento[]
  logsAuditoria         LogAuditoria[]

  @@map("usuarios")
}
```

- [ ] **Step 2: Editar `prisma/schema.prisma` — relação inversa em `Setor` + índice em `ItemComanda`**

No model `Setor` (linhas 309-323 hoje), adicionar a relação inversa `usuarios`:

```prisma
model Setor {
  id               String   @id @default(uuid())
  nome             String
  tempoAlvoMinutos Int?
  criadoEm         DateTime @default(now())

  estabelecimentoId String
  estabelecimento   Estabelecimento @relation(fields: [estabelecimentoId], references: [id])

  itensCardapio ItemCardapio[]
  itensComanda  ItemComanda[]
  usuarios      Usuario[]

  @@unique([estabelecimentoId, nome])
  @@map("setores")
}
```

No model `ItemComanda` (linhas 357-385 hoje), adicionar um `@@index` composto logo antes do
`@@map`, para a query de produção (filtra por `setorId` + `status`) não fazer table scan:

```prisma
model ItemComanda {
  id          String         @id @default(uuid())
  nomeItem    String
  quantidade  Int
  precoUnit   Decimal        @db.Decimal(10, 2)
  observacao  String?
  status      StatusProducao @default(recebido)
  recebidoEm  DateTime       @default(now())
  prontoEm    DateTime?
  entregueEm  DateTime?
  canceladoEm DateTime?

  comandaId String
  comanda   Comanda @relation(fields: [comandaId], references: [id], onDelete: Cascade)

  itemCardapioId String?
  itemCardapio   ItemCardapio? @relation(fields: [itemCardapioId], references: [id])

  setorId String?
  setor   Setor?  @relation(fields: [setorId], references: [id])

  criadoPorUsuarioId String?
  criadoPor          Usuario? @relation(fields: [criadoPorUsuarioId], references: [id])

  rateios        ItemComandaRateio[]
  pagamentoItens PagamentoItem[]

  @@index([setorId, status])
  @@map("itens_comanda")
}
```

- [ ] **Step 3: Gerar e rodar a migration**

```bash
npx prisma migrate dev --name usuario_setor_producao_indice
```

Expected: cria uma nova pasta em `prisma/migrations/` com um `migration.sql` contendo
`ALTER TABLE "usuarios" ADD COLUMN "setorId" TEXT;`, a `FOREIGN KEY` correspondente, e
`CREATE INDEX "itens_comanda_setorId_status_idx" ON "itens_comanda"("setorId", "status");`. O
comando roda a migration no Postgres local e regenera o Prisma Client automaticamente.

- [ ] **Step 4: Confirmar que o client gerado reconhece o campo novo**

```bash
npx tsc --noEmit
```

Expected: sem erros (o build ainda não referencia `setorId` em lugar nenhum do código
TypeScript, só o schema/migration mudaram nesta task).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: adiciona Usuario.setorId e índice de produção em ItemComanda"
```

---

### Task 2: Backend — aceitar/retornar setor do operador

**Files:**
- Modify: `src/routes/operadores.ts`

**Interfaces:**
- Consumes: `Usuario.setorId` (Task 1).
- Produces: `POST /estabelecimentos/operadores` e `PATCH /estabelecimentos/operadores/:id` aceitam
  `setorId?: string | null` no body; toda resposta que usa `selecionarOperador` agora inclui
  `setorId: string | null` e `setor: { nome: string } | null`.

- [ ] **Step 1: Reescrever `src/routes/operadores.ts` com o campo `setorId`**

Arquivo completo (mudanças: `CriarOperadorSchema` ganha `setorId` opcional, `AtualizarDadosSchema`
ganha `setorId` opcional e anulável, `selecionarOperador` seleciona `setorId` e `setor.nome`, os
handlers de `POST` e `PATCH /:id` passam o campo adiante):

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
import { autenticar } from '../plugins/auth.js';

const PERMISSOES_VALIDAS = ['cozinha', 'cardapio', 'historico', 'pedido_manual', 'configuracoes', 'mesas', 'caixa'] as const;

const CriarOperadorSchema = Type.Object({
  nome:    Type.String({ minLength: 2, maxLength: 100 }),
  email:   Type.String({ format: 'email' }),
  senha:   Type.String({ minLength: 8, maxLength: 100 }),
  setorId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const AtualizarPermissoesSchema = Type.Object({
  permissoes: Type.Array(
    Type.Union(PERMISSOES_VALIDAS.map((p) => Type.Literal(p)) as [ReturnType<typeof Type.Literal>])
  ),
});

const AtualizarDadosSchema = Type.Object({
  nome:    Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  email:   Type.Optional(Type.String({ format: 'email' })),
  setorId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const RedefinirSenhaOperadorSchema = Type.Object({
  novaSenha: Type.String({ minLength: 8, maxLength: 100 }),
});

const selecionarOperador = {
  id: true, nome: true, email: true, criadoEm: true, permissoes: true,
  setorId: true,
  setor: { select: { nome: true } },
} as const;

function apenasDono(request: Parameters<typeof autenticar>[0], reply: Parameters<typeof autenticar>[1]) {
  if (request.user.role !== 'DONO') {
    return reply.status(403).send({ erro: 'Apenas o DONO pode gerenciar operadores' });
  }
}

export async function operadoresRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', autenticar);

  // ── GET /estabelecimentos/operadores ──────────────────────────────────────
  fastify.get('/estabelecimentos/operadores', async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    return prisma.usuario.findMany({
      where:   { estabelecimentoId: request.user.estabelecimentoId!, role: 'OPERADOR' },
      select:  selecionarOperador,
      orderBy: { criadoEm: 'desc' },
    });
  });

  // ── POST /estabelecimentos/operadores ────────────────────────────────────
  fastify.post('/estabelecimentos/operadores', {
    schema: { body: CriarOperadorSchema },
  }, async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    const { nome, email, senha, setorId } = request.body as {
      nome: string; email: string; senha: string; setorId?: string | null;
    };

    const emailExistente = await prisma.usuario.findUnique({ where: { email } });
    if (emailExistente) return reply.status(409).send({ erro: 'Email já cadastrado' });

    const senhaHash = await bcrypt.hash(senha, 12);

    const operador = await prisma.usuario.create({
      data: {
        nome,
        email,
        senhaHash,
        role:              'OPERADOR',
        estabelecimentoId: request.user.estabelecimentoId!,
        permissoes:        ['cozinha'],
        setorId:           setorId ?? null,
      },
      select: selecionarOperador,
    });

    return reply.status(201).send(operador);
  });

  // ── PATCH /estabelecimentos/operadores/:id/permissoes ────────────────────
  fastify.patch('/estabelecimentos/operadores/:id/permissoes', {
    schema: {
      params: Type.Object({ id: Type.String() }),
      body:   AtualizarPermissoesSchema,
    },
  }, async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    const { id } = request.params as { id: string };
    const { permissoes } = request.body as { permissoes: string[] };

    const operador = await prisma.usuario.findUnique({ where: { id } });
    if (!operador || operador.estabelecimentoId !== request.user.estabelecimentoId || operador.role !== 'OPERADOR') {
      return reply.status(404).send({ erro: 'Operador não encontrado' });
    }

    return prisma.usuario.update({
      where:  { id },
      data:   { permissoes },
      select: selecionarOperador,
    });
  });

  // ── PATCH /estabelecimentos/operadores/:id ────────────────────────────────
  // Corrige nome/email cadastrados errados, e/ou muda o setor fixo do operador
  fastify.patch('/estabelecimentos/operadores/:id', {
    schema: {
      params: Type.Object({ id: Type.String() }),
      body:   AtualizarDadosSchema,
    },
  }, async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    const { id } = request.params as { id: string };
    const { nome, email, setorId } = request.body as { nome?: string; email?: string; setorId?: string | null };

    const operador = await prisma.usuario.findUnique({ where: { id } });
    if (!operador || operador.estabelecimentoId !== request.user.estabelecimentoId || operador.role !== 'OPERADOR') {
      return reply.status(404).send({ erro: 'Operador não encontrado' });
    }

    if (email && email !== operador.email) {
      const emailExistente = await prisma.usuario.findUnique({ where: { email } });
      if (emailExistente) return reply.status(409).send({ erro: 'Email já cadastrado' });
    }

    return prisma.usuario.update({
      where:  { id },
      data:   {
        ...(nome ? { nome } : {}),
        ...(email ? { email } : {}),
        ...(setorId !== undefined ? { setorId } : {}),
      },
      select: selecionarOperador,
    });
  });

  // ── PATCH /estabelecimentos/operadores/:id/senha ──────────────────────────
  // DONO redefine a senha do operador diretamente — sem fluxo de email
  fastify.patch('/estabelecimentos/operadores/:id/senha', {
    schema: {
      params: Type.Object({ id: Type.String() }),
      body:   RedefinirSenhaOperadorSchema,
    },
  }, async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    const { id } = request.params as { id: string };
    const { novaSenha } = request.body as { novaSenha: string };

    const operador = await prisma.usuario.findUnique({ where: { id } });
    if (!operador || operador.estabelecimentoId !== request.user.estabelecimentoId || operador.role !== 'OPERADOR') {
      return reply.status(404).send({ erro: 'Operador não encontrado' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 12);
    await prisma.usuario.update({ where: { id }, data: { senhaHash } });

    return reply.status(204).send();
  });

  // ── DELETE /estabelecimentos/operadores/:id ──────────────────────────────
  fastify.delete('/estabelecimentos/operadores/:id', {
    schema: { params: Type.Object({ id: Type.String() }) },
  }, async (request, reply) => {
    if (await apenasDono(request, reply)) return;

    const { id } = request.params as { id: string };

    const operador = await prisma.usuario.findUnique({ where: { id } });
    if (!operador || operador.estabelecimentoId !== request.user.estabelecimentoId || operador.role !== 'OPERADOR') {
      return reply.status(404).send({ erro: 'Operador não encontrado' });
    }

    await prisma.usuario.delete({ where: { id } });
    return reply.status(204).send();
  });
}
```

- [ ] **Step 2: Verificar compilação**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Testar manualmente via curl**

Com o backend rodando localmente (`npm run dev`) e logado como `carlos@teste.com` /
`outrasenha123` (Pizzaria do Bairro, DONO):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@teste.com","senha":"outrasenha123"}' | jq -r .token)

# Pegue um setorId existente (criado nas fases anteriores) via:
curl -s http://localhost:3000/setores -H "Authorization: Bearer $TOKEN" | jq

# Crie um operador já com setor:
curl -s -X POST http://localhost:3000/estabelecimentos/operadores \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nome":"Teste Setor","email":"teste.setor@pizzaria.com","senha":"senha12345","setorId":"<um-setor-id>"}' | jq
```

Expected: `201`, resposta incluindo `"setorId": "<um-setor-id>"` e `"setor": { "nome": "..." }`.
Depois teste `PATCH /estabelecimentos/operadores/:id` com `{"setorId": null}` pra desatribuir —
Expected: `200`, `"setorId": null, "setor": null`. Delete o operador de teste ao final:
`curl -X DELETE http://localhost:3000/estabelecimentos/operadores/<id> -H "Authorization: Bearer $TOKEN"`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/operadores.ts
git commit -m "feat: aceitar e retornar setor fixo do operador"
```

---

### Task 3: Frontend — dropdown de setor no cadastro/edição do operador

**Files:**
- Modify: `frontend/src/pages/Operadores.tsx`

**Interfaces:**
- Consumes: `GET /setores` (já existe, sem gate de módulo — retorna `{ id, nome, tempoAlvoMinutos,
  criadoEm, estabelecimentoId }[]`); `POST`/`PATCH /estabelecimentos/operadores` aceitando `setorId`
  (Task 2).

- [ ] **Step 1: Reescrever `frontend/src/pages/Operadores.tsx` com o dropdown de setor**

Arquivo completo (mudanças: interface `Operador` ganha `setorId`/`setor`, novo estado `setores` +
fetch, estados `setorId`/`setorIdEdicao`, dropdowns nos dois formulários, exibição do setor no card,
envio do campo nas duas chamadas de API):

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Users, Plus, Trash2, Loader2, X, ChevronDown, ChevronUp, Shield, Wand2, Pencil } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { TODAS_PERMISSOES, type Permissao } from '../lib/permissoes'

function gerarEmailFicticio(nomePessoa: string, slugEstabelecimento: string): string {
  const partes = nomePessoa
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const primeiro = partes[0] ?? 'operador'
  const ultimo   = partes.length > 1 ? partes[partes.length - 1] : ''
  const usuario  = [primeiro, ultimo].filter(Boolean).join('.')
  const dominio  = (slugEstabelecimento || 'equipe').replace(/-/g, '')

  return `${usuario}@${dominio}.com`
}

interface Setor {
  id: string
  nome: string
}

interface Operador {
  id:         string
  nome:       string
  email:      string
  criadoEm:   string
  permissoes: Permissao[]
  setorId:    string | null
  setor:      { nome: string } | null
}

function formatarData(data: string) {
  return new Date(data).toLocaleDateString('pt-BR')
}

export default function Operadores() {
  const token = localStorage.getItem('token')
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [setorId, setSetorId] = useState('')
  const [criando, setCriando] = useState(false)
  const [removendoId, setRemovendoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [salvandoPermissoes, setSalvandoPermissoes] = useState<string | null>(null)
  const [slugEstabelecimento, setSlugEstabelecimento] = useState('')

  // Editar operador (nome / email / senha / setor)
  const [edicaoOperador, setEdicaoOperador] = useState<Operador | null>(null)
  const [nomeEdicao, setNomeEdicao]         = useState('')
  const [emailEdicao, setEmailEdicao]       = useState('')
  const [novaSenhaEdicao, setNovaSenhaEdicao] = useState('')
  const [setorIdEdicao, setSetorIdEdicao]   = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [erroEdicao, setErroEdicao]         = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/estabelecimentos/operadores`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setOperadores)
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [token])

  useEffect(() => {
    fetch(`${API_URL}/setores`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setSetores)
      .catch(console.error)
  }, [token])

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((est) => setSlugEstabelecimento(est.slug ?? ''))
      .catch(console.error)
  }, [token])

  function abrirModal() {
    setNome('')
    setEmail('')
    setSenha('')
    setSetorId('')
    setErro(null)
    setModalAberto(true)
  }

  async function criarOperador(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCriando(true)
    try {
      const resp = await fetch(`${API_URL}/estabelecimentos/operadores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome, email, senha, setorId: setorId || null }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErro(dados.erro ?? 'Erro ao criar operador'); return }
      setOperadores((prev) => [dados, ...prev])
      setModalAberto(false)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCriando(false)
    }
  }

  async function removerOperador(id: string) {
    setRemovendoId(id)
    try {
      const resp = await fetch(`${API_URL}/estabelecimentos/operadores/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) { setErro('Não foi possível remover o operador.'); return }
      setOperadores((prev) => prev.filter((o) => o.id !== id))
    } catch {
      setErro('Falha de conexão ao remover operador.')
    } finally {
      setRemovendoId(null)
    }
  }

  function togglePermissao(operador: Operador, permissao: Permissao) {
    const novas = operador.permissoes.includes(permissao)
      ? operador.permissoes.filter((p) => p !== permissao)
      : [...operador.permissoes, permissao]
    setOperadores((prev) => prev.map((o) => o.id === operador.id ? { ...o, permissoes: novas } : o))
  }

  async function salvarPermissoes(operador: Operador) {
    setSalvandoPermissoes(operador.id)
    try {
      await fetch(`${API_URL}/estabelecimentos/operadores/${operador.id}/permissoes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permissoes: operador.permissoes }),
      })
    } catch {
      setErro('Falha ao salvar permissões')
    } finally {
      setSalvandoPermissoes(null)
    }
  }

  function abrirEdicao(operador: Operador) {
    setEdicaoOperador(operador)
    setNomeEdicao(operador.nome)
    setEmailEdicao(operador.email)
    setNovaSenhaEdicao('')
    setSetorIdEdicao(operador.setorId ?? '')
    setErroEdicao(null)
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault()
    if (!edicaoOperador) return
    setErroEdicao(null)
    setSalvandoEdicao(true)
    try {
      const resp = await fetch(`${API_URL}/estabelecimentos/operadores/${edicaoOperador.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: nomeEdicao, email: emailEdicao, setorId: setorIdEdicao || null }),
      })
      const dados = await resp.json()
      if (!resp.ok) { setErroEdicao(dados.erro ?? 'Erro ao salvar'); return }

      if (novaSenhaEdicao.trim()) {
        const respSenha = await fetch(`${API_URL}/estabelecimentos/operadores/${edicaoOperador.id}/senha`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ novaSenha: novaSenhaEdicao }),
        })
        if (!respSenha.ok) { setErroEdicao('Dados salvos, mas a senha não pôde ser redefinida.'); return }
      }

      setOperadores((prev) => prev.map((o) => (o.id === edicaoOperador.id ? { ...o, ...dados } : o)))
      setEdicaoOperador(null)
    } catch {
      setErroEdicao('Falha de conexão')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">Operadores</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {operadores.length} cadastrado{operadores.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={abrirModal}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Novo Operador
        </button>
      </div>

      {erro && !modalAberto && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/30">
          <span>{erro}</span>
          <button onClick={() => setErro(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {carregando ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      ) : operadores.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <Users className="h-10 w-10" />
          <p>Nenhum operador cadastrado.</p>
          <button onClick={abrirModal} className="text-sm font-medium text-orange-400 hover:text-orange-300">
            Adicionar operador
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {operadores.map((op) => (
            <div key={op.id} className="rounded-2xl border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between p-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{op.nome}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{op.email}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    desde {formatarData(op.criadoEm)}
                    {op.setor && <> · setor: <span className="text-zinc-400">{op.setor.nome}</span></>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {op.permissoes.map((p) => (
                      <span key={p} className="rounded-md bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400 ring-1 ring-orange-500/20">
                        {TODAS_PERMISSOES.find((x) => x.id === p)?.label.split(' —')[0] ?? p}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => abrirEdicao(op)}
                    className="rounded-xl border border-zinc-700 p-2.5 text-zinc-400 transition hover:bg-zinc-800"
                    title="Editar dados / redefinir senha"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setExpandidoId(expandidoId === op.id ? null : op.id)}
                    className="rounded-xl border border-zinc-700 p-2.5 text-zinc-400 transition hover:bg-zinc-800"
                    title="Editar permissões"
                  >
                    <Shield className="h-4 w-4" />
                    {expandidoId === op.id ? <ChevronUp className="h-3 w-3 mt-0.5" /> : <ChevronDown className="h-3 w-3 mt-0.5" />}
                  </button>
                  <button
                    onClick={() => removerOperador(op.id)}
                    disabled={removendoId === op.id}
                    className="rounded-xl bg-red-500/10 p-2.5 text-red-400 ring-1 ring-red-500/30 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {removendoId === op.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {expandidoId === op.id && (
                <div className="border-t border-zinc-800 px-5 pb-5 pt-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Permissões</p>
                  <div className="space-y-2">
                    {TODAS_PERMISSOES.map(({ id, label }) => (
                      <label key={id} className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={op.permissoes.includes(id)}
                          onChange={() => togglePermissao(op, id)}
                          className="h-4 w-4 rounded border-zinc-600 accent-orange-500"
                        />
                        <span className="text-sm text-zinc-300">{label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => salvarPermissoes(op)}
                    disabled={salvandoPermissoes === op.id}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
                  >
                    {salvandoPermissoes === op.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Salvar permissões
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">Novo Operador</h3>
              <button onClick={() => setModalAberto(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={criarOperador} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
                <input type="text" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Email de acesso</span>
                <div className="flex gap-2">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operador@email.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
                  <button type="button" onClick={() => setEmail(gerarEmailFicticio(nome, slugEstabelecimento))} title="Gerar email fictício"
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-400 transition hover:border-orange-500 hover:text-orange-400">
                    <Wand2 className="h-3.5 w-3.5" />
                    Gerar
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Não precisa ser um email real — é só o login do funcionário no sistema. Pode gerar um automaticamente.
                </p>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Senha</span>
                <input type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Setor fixo (opcional)</span>
                <select
                  value={setorId}
                  onChange={(e) => setSetorId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-orange-500"
                >
                  <option value="">Sem setor fixo (vê a produção de todos)</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Define qual painel de produção esse operador vê. Deixe em branco se ele deve ver tudo.
                </p>
              </label>
              <p className="text-xs text-zinc-500">O operador começa com acesso à Cozinha. Ajuste as permissões depois.</p>
              {erro && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">{erro}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalAberto(false)}
                  className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800">Cancelar</button>
                <button type="submit" disabled={criando}
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">
                  {criando && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar operador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {edicaoOperador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-bold">Editar operador</h3>
              <button onClick={() => setEdicaoOperador(null)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={salvarEdicao} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nome</span>
                <input type="text" required value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Email de acesso</span>
                <div className="flex gap-2">
                  <input type="email" required value={emailEdicao} onChange={(e) => setEmailEdicao(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
                  <button type="button" onClick={() => setEmailEdicao(gerarEmailFicticio(nomeEdicao, slugEstabelecimento))} title="Gerar email fictício"
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-400 transition hover:border-orange-500 hover:text-orange-400">
                    <Wand2 className="h-3.5 w-3.5" />
                    Gerar
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Nova senha</span>
                <input type="password" minLength={8} value={novaSenhaEdicao} onChange={(e) => setNovaSenhaEdicao(e.target.value)}
                  placeholder="Deixe em branco para manter a atual"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500" />
                <p className="mt-1.5 text-xs text-zinc-500">
                  Preencha só se quiser redefinir a senha do operador (mínimo 8 caracteres).
                </p>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Setor fixo</span>
                <select
                  value={setorIdEdicao}
                  onChange={(e) => setSetorIdEdicao(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-orange-500"
                >
                  <option value="">Sem setor fixo (vê a produção de todos)</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </label>
              {erroEdicao && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">{erroEdicao}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEdicaoOperador(null)}
                  className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800">Cancelar</button>
                <button type="submit" disabled={salvandoEdicao}
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">
                  {salvandoEdicao && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Testar manualmente no navegador**

Logar como `carlos@teste.com` (Pizzaria do Bairro, DONO), ir em Operadores, criar um operador
escolhendo um setor no dropdown, confirmar que o card mostra "· setor: <nome>". Editar o mesmo
operador e trocar pra "Sem setor fixo" — confirmar que a etiqueta de setor some do card.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Operadores.tsx
git commit -m "feat: dropdown de setor fixo no cadastro/edição de operador"
```

---

### Task 4: Backend — `setorId` na sessão (JWT)

**Files:**
- Modify: `src/plugins/auth.ts`
- Modify: `src/routes/auth.ts`

**Interfaces:**
- Consumes: `Usuario.setorId` (Task 1).
- Produces: `request.user.setorId: string | null` disponível em qualquer rota autenticada, e o
  payload do JWT (usado também pelo `socket.ts` na Task 7) carrega `setorId`.

- [ ] **Step 1: Editar `src/plugins/auth.ts` — adicionar `setorId` ao tipo do JWT**

Modificar só o bloco de module augmentation (linhas 8-23 hoje), sem tocar no resto do arquivo:

```typescript
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      estabelecimentoId: string | null; // null para SUPER_ADMIN
      role: 'SUPER_ADMIN' | 'DONO' | 'OPERADOR';
      permissoes: string[];
      setorId: string | null;
    };
    user: {
      userId: string;
      estabelecimentoId: string | null;
      role: 'SUPER_ADMIN' | 'DONO' | 'OPERADOR';
      permissoes: string[];
      setorId: string | null;
    };
  }
}
```

- [ ] **Step 2: Editar `src/routes/auth.ts` — incluir `setorId` no login e no JWT**

No handler de `POST /auth/login` (linhas 90-127 hoje), a busca do usuário (linha 95-98) já usa
`include: { estabelecimento: true }` — não seleciona campos específicos, então `usuario.setorId` já
vem junto automaticamente (não precisa mudar o `findUnique`). Só o `fastify.jwt.sign` precisa do
campo novo:

```typescript
    const token = fastify.jwt.sign({
      userId:            usuario.id,
      estabelecimentoId: usuario.estabelecimentoId,
      role:              usuario.role,
      permissoes:        usuario.role === 'OPERADOR' ? usuario.permissoes : [],
      setorId:           usuario.setorId,
    });
```

- [ ] **Step 2: Verificar compilação**

```bash
npx tsc --noEmit
```

Expected: sem erros (o `FastifyRequest['user']` é populado automaticamente pelo `@fastify/jwt` a
partir do payload verificado — nenhuma outra rota quebra por ganhar um campo novo no tipo).

- [ ] **Step 3: Testar manualmente**

```bash
# Login do operador de teste criado na Task 2 (ou outro com setor atribuído)
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teste.setor@pizzaria.com","senha":"senha12345"}' | jq -r .token \
  | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

Expected: o JSON decodificado do payload do JWT contém `"setorId": "<o-id-do-setor>"`.

- [ ] **Step 4: Commit**

```bash
git add src/plugins/auth.ts src/routes/auth.ts
git commit -m "feat: setorId do operador viaja no JWT"
```

---

### Task 5: Backend — rota `GET /producao/itens`

**Files:**
- Create: `src/utils/producao.ts`
- Test: `src/utils/producao.test.ts`
- Create: `src/routes/producao.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: `request.user.setorId` (Task 4); `ItemComanda(setorId, status)` índice (Task 1).
- Produces: `GET /producao/itens` retornando `ItemProducao[]`; funções puras exportadas de
  `src/utils/producao.ts` — `filtroSetorProducao(setorId: string | null): { setorId?: string }`,
  `serializarItemProducao(item: ItemComandaParaProducao)`, `salaProducao(estabelecimentoId: string,
  setorId: string | null): string[]` — **as três consumidas pela Task 6**.

Seguindo o mesmo padrão de `src/utils/statusProducao.ts` (lógica pura, sem import de `prisma`,
testável isoladamente): as funções de transformação/filtro ficam em `src/utils/producao.ts`, e
`src/routes/producao.ts` só registra a rota Fastify, importando essas funções.

- [ ] **Step 1: Escrever o teste das funções puras**

Criar `src/utils/producao.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { filtroSetorProducao, salaProducao } from './producao.js';

describe('filtroSetorProducao', () => {
  it('filtra por setor quando o usuário tem um setor fixo', () => {
    expect(filtroSetorProducao('setor-123')).toEqual({ setorId: 'setor-123' });
  });

  it('não filtra (vê todos os setores) quando o usuário não tem setor fixo', () => {
    expect(filtroSetorProducao(null)).toEqual({});
  });
});

describe('salaProducao', () => {
  it('inclui a sala ampla e a sala do setor quando o item tem setor', () => {
    expect(salaProducao('est-1', 'setor-1')).toEqual(['est-1', 'est-1:setor-1']);
  });

  it('inclui só a sala ampla quando o item não tem setor', () => {
    expect(salaProducao('est-1', null)).toEqual(['est-1']);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx vitest run src/utils/producao.test.ts
```

Expected: FAIL — `Cannot find module './producao.js'` (o arquivo ainda não existe).

- [ ] **Step 3: Criar `src/utils/producao.ts`**

```typescript
import type { StatusProducao } from '../generated/prisma/enums.js';

export function filtroSetorProducao(setorId: string | null): { setorId?: string } {
  return setorId ? { setorId } : {};
}

interface ItemComandaParaProducao {
  id: string;
  nomeItem: string;
  quantidade: number;
  observacao: string | null;
  status: StatusProducao;
  recebidoEm: Date;
  setorId: string | null;
  setor: { nome: string; tempoAlvoMinutos: number | null } | null;
  comanda: { nome: string; conta: { mesa: { numero: string } } };
}

export function serializarItemProducao(item: ItemComandaParaProducao) {
  return {
    id:               item.id,
    nomeItem:         item.nomeItem,
    quantidade:       item.quantidade,
    observacao:       item.observacao,
    status:           item.status,
    recebidoEm:       item.recebidoEm,
    setorId:          item.setorId,
    setorNome:        item.setor?.nome ?? null,
    tempoAlvoMinutos: item.setor?.tempoAlvoMinutos ?? null,
    mesaNumero:       item.comanda.conta.mesa.numero,
    comandaNome:      item.comanda.nome,
  };
}

export function salaProducao(estabelecimentoId: string, setorId: string | null): string[] {
  return setorId ? [estabelecimentoId, `${estabelecimentoId}:${setorId}`] : [estabelecimentoId];
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx vitest run src/utils/producao.test.ts
```

Expected: PASS — 4/4 testes.

- [ ] **Step 5: Criar `src/routes/producao.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { prisma } from '../database.js';
import { autenticar, temPermissao, moduloAtivo } from '../plugins/auth.js';
import { filtroSetorProducao, serializarItemProducao } from '../utils/producao.js';
import type { StatusProducao } from '../generated/prisma/enums.js';

export async function producaoRoutes(fastify: FastifyInstance) {
  // ── GET /producao/itens ──────────────────────────────────────────────────
  // Itens de ItemComanda ainda em produção (recebido/em_preparo/pronto), filtrados
  // pelo setor fixo do usuário logado — ou todos os setores, se ele não tiver um.
  fastify.get('/producao/itens', {
    onRequest: [autenticar, temPermissao('mesas'), moduloAtivo('mesas')],
  }, async (request) => {
    const { estabelecimentoId, setorId } = request.user;

    const itens = await prisma.itemComanda.findMany({
      where: {
        status: { in: ['recebido', 'em_preparo', 'pronto'] as StatusProducao[] },
        comanda: { conta: { estabelecimentoId: estabelecimentoId! } },
        ...filtroSetorProducao(setorId),
      },
      include: {
        setor: true,
        comanda: { include: { conta: { include: { mesa: true } } } },
      },
      orderBy: { recebidoEm: 'asc' },
    });

    return itens.map(serializarItemProducao);
  });
}
```

- [ ] **Step 6: Registrar a rota em `src/server.ts`**

No topo do arquivo, junto aos outros imports de rotas (logo após a linha do `contasRoutes`):

```typescript
import { producaoRoutes } from './routes/producao.js';
```

No bloco de registro de rotas, logo após `await fastify.register(contasRoutes);`:

```typescript
  await fastify.register(producaoRoutes);
```

- [ ] **Step 7: Verificar compilação**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 8: Testar manualmente via curl**

Com pelo menos um item de comanda existente e com setor atribuído (das fases anteriores):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@teste.com","senha":"outrasenha123"}' | jq -r .token)

curl -s http://localhost:3000/producao/itens -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `200`, array de objetos no formato `{ id, nomeItem, quantidade, observacao, status,
recebidoEm, setorId, setorNome, tempoAlvoMinutos, mesaNumero, comandaNome }`, só com itens em
`recebido`/`em_preparo`/`pronto` (nenhum `entregue`/`cancelado`). Como o DONO não tem `setorId`, deve
retornar itens de **todos** os setores.

- [ ] **Step 9: Commit**

```bash
git add src/utils/producao.ts src/utils/producao.test.ts src/routes/producao.ts src/server.ts
git commit -m "feat: rota GET /producao/itens para o Kanban de produção"
```

---

### Task 6: Backend — emitir eventos de produção nas mudanças de item

**Files:**
- Modify: `src/routes/contas.ts`

**Interfaces:**
- Consumes: `serializarItemProducao`, `salaProducao` (Task 5, exportados de `src/utils/producao.ts`).
- Produces: eventos Socket.IO `producao:item-novo` e `producao:item-atualizado`, emitidos
  ADICIONALMENTE aos eventos `item-comanda:novo`/`item-comanda:atualizado` já existentes (que
  continuam indo pra sala ampla, inalterados).

- [ ] **Step 1: Importar os helpers de produção no topo de `src/routes/contas.ts`**

Adicionar ao bloco de imports existente (linha 1-8 hoje):

```typescript
import { serializarItemProducao, salaProducao } from '../utils/producao.js';
```

- [ ] **Step 2: Emitir `producao:item-novo` em `POST /comandas/:id/itens`**

Na rota `POST /comandas/:id/itens` (linhas 235-271 hoje), logo depois do emit existente de
`item-comanda:novo` e antes do `return reply.status(201).send(serializado)`, adicionar:

```typescript
    const serializado = serializarItemComanda(itemComanda);
    getIO().to(estabelecimentoId!).emit('item-comanda:novo', serializado);

    if (itemComanda.setorId) {
      const itemParaProducao = await prisma.itemComanda.findUnique({
        where:   { id: itemComanda.id },
        include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
      });
      if (itemParaProducao) {
        getIO()
          .to(salaProducao(estabelecimentoId!, itemParaProducao.setorId))
          .emit('producao:item-novo', serializarItemProducao(itemParaProducao));
      }
    }

    return reply.status(201).send(serializado);
```

(O restante da rota — a busca de `comanda`/`itemCardapio` e o `prisma.itemComanda.create` — não
muda.)

- [ ] **Step 3: Emitir `producao:item-atualizado` em `PATCH /itens-comanda/:id/status`**

Na rota `PATCH /itens-comanda/:id/status` (linhas 274-303 hoje), logo depois do emit existente de
`item-comanda:atualizado` e antes do `return serializado`, adicionar:

```typescript
    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { status, ...timestamps } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);

    if (atualizado.setorId) {
      const itemParaProducao = await prisma.itemComanda.findUnique({
        where:   { id: atualizado.id },
        include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
      });
      if (itemParaProducao) {
        getIO()
          .to(salaProducao(estabelecimentoId!, itemParaProducao.setorId))
          .emit('producao:item-atualizado', serializarItemProducao(itemParaProducao));
      }
    }

    return serializado;
```

- [ ] **Step 4: Emitir `producao:item-atualizado` em `PATCH /itens-comanda/:id/transferir`**

Transferir um item de comanda não muda o setor dele, mas muda a etiqueta "Mesa X · Comanda Y" que o
Kanban mostra — precisa do mesmo aviso. Na rota `PATCH /itens-comanda/:id/transferir` (linhas
307-332 hoje), logo depois do emit existente de `item-comanda:atualizado` e antes do `return
serializado`, adicionar o mesmo bloco:

```typescript
    const atualizado = await prisma.itemComanda.update({ where: { id }, data: { comandaId } });
    const serializado = { ...atualizado, precoUnit: Number(atualizado.precoUnit) };
    getIO().to(estabelecimentoId!).emit('item-comanda:atualizado', serializado);

    if (atualizado.setorId) {
      const itemParaProducao = await prisma.itemComanda.findUnique({
        where:   { id: atualizado.id },
        include: { setor: true, comanda: { include: { conta: { include: { mesa: true } } } } },
      });
      if (itemParaProducao) {
        getIO()
          .to(salaProducao(estabelecimentoId!, itemParaProducao.setorId))
          .emit('producao:item-atualizado', serializarItemProducao(itemParaProducao));
      }
    }

    return serializado;
```

- [ ] **Step 5: Verificar compilação**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 6: Rodar a suíte completa de testes**

```bash
npm test
```

Expected: todos os testes existentes continuam passando (nenhum teste cobre `contas.ts`
diretamente hoje — esta task não adiciona novos testes automatizados, só reaproveita as funções
puras já testadas na Task 5).

- [ ] **Step 7: Testar manualmente via curl — confirmar que o evento antigo não mudou**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos@teste.com","senha":"outrasenha123"}' | jq -r .token)

# Pegue um comandaId de uma mesa aberta (via GET /contas) e um itemCardapioId com setor (via GET /cardapio)
curl -s -X POST http://localhost:3000/comandas/<comandaId>/itens \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"itemCardapioId":"<itemCardapioId>","quantidade":1}' | jq
```

Expected: resposta `201` no formato de sempre (`id, nomeItem, quantidade, precoUnit (number),
observacao, status, ..., setorId, criadoPorUsuarioId` — **sem** `comanda`/`setor` aninhados, ou seja,
o shape do `item-comanda:novo`/resposta HTTP não mudou). Confirme via `GET /producao/itens` (Task 5)
que o item novo aparece lá.

- [ ] **Step 8: Commit**

```bash
git add src/routes/contas.ts
git commit -m "feat: emitir eventos de produção escopados por setor nas mudanças de item"
```

---

### Task 7: Backend — salas de Socket.IO por contexto de produção

**Files:**
- Create: `src/utils/salasSocket.ts`
- Test: `src/utils/salasSocket.test.ts`
- Modify: `src/socket.ts`

**Interfaces:**
- Consumes: `payload.setorId` do JWT (Task 4).
- Produces: função pura exportada `salasParaConexao(params): string[]`, usada por `socket.ts`.

- [ ] **Step 1: Escrever o teste da função pura de decisão de salas**

Criar `src/utils/salasSocket.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { salasParaConexao } from './salasSocket.js';

describe('salasParaConexao', () => {
  it('conexão de produção com setor fixo entra só na sala do setor', () => {
    expect(salasParaConexao({ estabelecimentoId: 'est-1', setorId: 'setor-1', contexto: 'producao' }))
      .toEqual(['est-1:setor-1']);
  });

  it('conexão de produção sem setor fixo (DONO) cai na sala ampla', () => {
    expect(salasParaConexao({ estabelecimentoId: 'est-1', setorId: null, contexto: 'producao' }))
      .toEqual(['est-1']);
  });

  it('conexão comum (sem contexto) entra na sala ampla mesmo com setor fixo', () => {
    expect(salasParaConexao({ estabelecimentoId: 'est-1', setorId: 'setor-1', contexto: null }))
      .toEqual(['est-1']);
  });

  it('conexão comum sem contexto e sem setor entra na sala ampla', () => {
    expect(salasParaConexao({ estabelecimentoId: 'est-1', setorId: null, contexto: null }))
      .toEqual(['est-1']);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx vitest run src/utils/salasSocket.test.ts
```

Expected: FAIL — `Cannot find module './salasSocket.js'`.

- [ ] **Step 3: Criar `src/utils/salasSocket.ts`**

```typescript
/**
 * Decide em quais salas do Socket.IO uma conexão deve entrar.
 *
 * Conexões comuns (Layout, Cozinha, Mesas) sempre entram na sala ampla do
 * estabelecimento, preservando o comportamento de hoje — não recebem/enviam
 * `contexto`. Só a tela de Produção (Fase 1d) abre uma conexão dedicada com
 * `contexto: 'producao'`; se o usuário tiver um setor fixo, essa conexão entra
 * SÓ na sala do setor (reduz tráfego); sem setor fixo (DONO, ou operador sem
 * setor definido — "vê tudo"), cai de volta na sala ampla.
 */
export function salasParaConexao(params: {
  estabelecimentoId: string;
  setorId: string | null;
  contexto: string | null;
}): string[] {
  const { estabelecimentoId, setorId, contexto } = params;
  if (contexto === 'producao' && setorId) {
    return [`${estabelecimentoId}:${setorId}`];
  }
  return [estabelecimentoId];
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx vitest run src/utils/salasSocket.test.ts
```

Expected: PASS — 4/4 testes.

- [ ] **Step 5: Usar a função em `src/socket.ts`**

Arquivo completo (a única mudança é dentro do `io.use`: ler `setorId` do payload e `contexto` do
handshake, e trocar o `socket.join(payload.estabelecimentoId)` fixo por um loop sobre
`salasParaConexao(...)`):

```typescript
import { Server } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { salasParaConexao } from './utils/salasSocket.js';

let io: Server;

function origensPermitidas(): string[] {
  const dev = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const prod = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((u) => u.trim()).filter(Boolean)
    : [];
  return [...dev, ...prod];
}

export function inicializarSocket(fastify: FastifyInstance) {
  io = new Server(fastify.server, {
    cors: {
      origin: origensPermitidas(),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token ausente'));

    try {
      const payload = fastify.jwt.verify<{ estabelecimentoId: string; userId: string; setorId: string | null }>(token);
      const contexto = (socket.handshake.auth?.contexto as string | undefined) ?? null;
      socket.data.estabelecimentoId = payload.estabelecimentoId;

      for (const sala of salasParaConexao({
        estabelecimentoId: payload.estabelecimentoId,
        setorId:           payload.setorId,
        contexto,
      })) {
        socket.join(sala);
      }

      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  fastify.log.info('Socket.IO inicializado');
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO não foi inicializado');
  return io;
}
```

- [ ] **Step 6: Verificar compilação**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 7: Rodar a suíte completa de testes**

```bash
npm test
```

Expected: todos os testes passam, incluindo os 4 novos de `salasSocket.test.ts`.

- [ ] **Step 8: Testar manualmente — confirmar que conexões comuns não regrediram**

Com o backend e frontend locais rodando, logar no navegador como `carlos@teste.com`, abrir a tela
de Mesas (Fase 1c) e o DevTools → Network → WS, confirmar que a conexão do socket continua abrindo
normalmente e que criar/editar uma comanda ainda atualiza a tela em tempo real (mesmo teste de duas
abas já usado na Fase 1c, Task 8) — isso confirma que a sala ampla não regrediu pra conexões sem
`contexto`.

- [ ] **Step 9: Commit**

```bash
git add src/utils/salasSocket.ts src/utils/salasSocket.test.ts src/socket.ts
git commit -m "feat: salas de Socket.IO por setor para conexões de produção"
```

---

### Task 8: Frontend — hook `useSocketProducao`

**Files:**
- Create: `frontend/src/hooks/useSocketProducao.ts`

**Interfaces:**
- Consumes: nenhuma interface nova de outra task — variação do `useSocket` já existente.
- Produces: `useSocketProducao(token: string | null): { socket: Socket | null; conectado: boolean;
  erro: string | null }` — mesma assinatura de `useSocket`, usada pela Task 9.

- [ ] **Step 1: Criar `frontend/src/hooks/useSocketProducao.ts`**

Cópia de `frontend/src/hooks/useSocket.ts` com uma única diferença: o `auth` da conexão inclui
`contexto: 'producao'`, fazendo o backend (Task 7) colocar essa conexão na sala do setor em vez da
sala ampla.

```typescript
import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_URL } from '../lib/api'

interface UseSocketReturn {
  socket: Socket | null
  conectado: boolean
  erro: string | null
}

export function useSocketProducao(token: string | null): UseSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [conectado, setConectado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setSocket(null)
      setConectado(false)
      return
    }

    const novoSocket = io(API_URL, {
      auth: { token, contexto: 'producao' },
      transports: ['websocket'], // Railway bloqueia XHR long-polling
    })

    novoSocket.on('connect', () => {
      setConectado(true)
      setErro(null)
    })

    novoSocket.on('connect_error', (err) => {
      setConectado(false)
      setErro(err.message)
    })

    novoSocket.on('disconnect', () => {
      setConectado(false)
    })

    setSocket(novoSocket)

    return () => {
      novoSocket.disconnect()
    }
  }, [token])

  return { socket, conectado, erro }
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSocketProducao.ts
git commit -m "feat: hook useSocketProducao com contexto dedicado de sala"
```

---

### Task 9: Frontend — página `Producao.tsx` (Kanban)

**Files:**
- Create: `frontend/src/pages/Producao.tsx`

**Interfaces:**
- Consumes: `GET /producao/itens` (Task 5); eventos `producao:item-novo`/`producao:item-atualizado`
  (Task 6); `useSocketProducao` (Task 8); `PATCH /itens-comanda/:id/status` (rota já existente,
  Fase 1b).
- Produces: componente `Producao` default export — **consumido pela Task 10** (rota + nav link).

- [ ] **Step 1: Criar `frontend/src/pages/Producao.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Loader2, ChefHat } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'
import { useSocketProducao } from '../hooks/useSocketProducao'

// ── Tipos ──────────────────────────────────────────────────────────────────

type StatusProducao = 'recebido' | 'em_preparo' | 'pronto' | 'entregue' | 'cancelado'

interface ItemProducao {
  id: string
  nomeItem: string
  quantidade: number
  observacao: string | null
  status: StatusProducao
  recebidoEm: string
  setorId: string | null
  setorNome: string | null
  tempoAlvoMinutos: number | null
  mesaNumero: string
  comandaNome: string
}

// ── Helpers visuais ────────────────────────────────────────────────────────

const colunas: { status: StatusProducao; titulo: string }[] = [
  { status: 'recebido',   titulo: 'Recebido' },
  { status: 'em_preparo', titulo: 'Em preparo' },
  { status: 'pronto',     titulo: 'Pronto' },
]

const proximoStatus: Partial<Record<StatusProducao, StatusProducao>> = {
  recebido:   'em_preparo',
  em_preparo: 'pronto',
  pronto:     'entregue',
}

const labelAvancar: Partial<Record<StatusProducao, string>> = {
  recebido:   'Iniciar preparo',
  em_preparo: 'Marcar pronto',
  pronto:     'Marcar entregue',
}

function minutosDesde(dataIso: string): number {
  return Math.floor((Date.now() - new Date(dataIso).getTime()) / 60000)
}

function corCronometro(minutos: number, tempoAlvoMinutos: number | null): string {
  if (tempoAlvoMinutos === null) return 'text-zinc-500'
  if (minutos >= tempoAlvoMinutos) return 'text-red-400'
  if (minutos >= tempoAlvoMinutos * 0.7) return 'text-yellow-400'
  return 'text-zinc-500'
}

export default function Producao() {
  const token = localStorage.getItem('token')
  const { socket } = useSocketProducao(token)

  const [modulosAtivos, setModulosAtivos] = useState<string[] | null>(null)
  const [itens, setItens] = useState<ItemProducao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [avancandoId, setAvancandoId] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())

  function carregarItens() {
    fetch(`${API_URL}/producao/itens`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setItens)
      .catch((err) => { console.error(err); setErro('Falha ao carregar produção') })
      .finally(() => setCarregando(false))
  }

  function atualizarItemLocal(item: ItemProducao) {
    setItens((prev) => {
      const semEsseItem = prev.filter((i) => i.id !== item.id)
      const aindaAtivo = item.status === 'recebido' || item.status === 'em_preparo' || item.status === 'pronto'
      return aindaAtivo ? [...semEsseItem, item] : semEsseItem
    })
  }

  async function avancarStatus(item: ItemProducao) {
    const novoStatus = proximoStatus[item.status]
    if (!novoStatus) return
    setAvancandoId(item.id)
    try {
      const resp = await fetch(`${API_URL}/itens-comanda/${item.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
      })
      if (resp.ok) {
        const atualizado = await resp.json()
        atualizarItemLocal({ ...item, status: atualizado.status })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAvancandoId(null)
    }
  }

  useEffect(() => {
    fetch(`${API_URL}/meu-estabelecimento`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setModulosAtivos(data.modulosAtivos ?? []))
      .catch(() => setModulosAtivos([]))
  }, [token])

  useEffect(() => {
    if (modulosAtivos?.includes('mesas')) carregarItens()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulosAtivos])

  useEffect(() => {
    if (!socket) return

    function aoReceberItem(item: ItemProducao) {
      atualizarItemLocal(item)
    }

    socket.on('producao:item-novo', aoReceberItem)
    socket.on('producao:item-atualizado', aoReceberItem)

    return () => {
      socket.off('producao:item-novo', aoReceberItem)
      socket.off('producao:item-atualizado', aoReceberItem)
    }
  }, [socket])

  useEffect(() => {
    const intervalo = setInterval(() => setAgora(Date.now()), 15000)
    return () => clearInterval(intervalo)
  }, [])

  if (modulosAtivos !== null && !modulosAtivos.includes('mesas')) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-semibold">Módulo de mesas não habilitado</p>
          <p className="text-sm text-zinc-400">Fale com o suporte pra habilitar esse módulo no seu plano.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <h2 className="mb-6 text-2xl font-extrabold">Produção</h2>
      {erro && <p className="mb-4 text-sm text-red-400">{erro}</p>}
      {carregando ? (
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {colunas.map((coluna) => {
            const itensDaColuna = itens
              .filter((i) => i.status === coluna.status)
              .sort((a, b) => new Date(a.recebidoEm).getTime() - new Date(b.recebidoEm).getTime())

            return (
              <div key={coluna.status} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="font-semibold text-zinc-200">{coluna.titulo}</h3>
                  <span className="text-xs text-zinc-500">{itensDaColuna.length}</span>
                </div>

                {itensDaColuna.length === 0 ? (
                  <p className="px-1 text-sm text-zinc-600">Nada por aqui.</p>
                ) : (
                  <div className="space-y-2">
                    {itensDaColuna.map((item) => {
                      const minutos = minutosDesde(item.recebidoEm)
                      return (
                        <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-zinc-100">
                              {item.quantidade}x {item.nomeItem}
                            </span>
                            <span className={`flex items-center gap-1 text-xs font-medium ${corCronometro(minutos, item.tempoAlvoMinutos)}`}>
                              {minutos}min
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500">
                            Mesa {item.mesaNumero} · {item.comandaNome}
                          </p>
                          {item.observacao && (
                            <p className="mt-1 text-xs italic text-zinc-500">{item.observacao}</p>
                          )}
                          {labelAvancar[item.status] && (
                            <button
                              onClick={() => avancarStatus(item)}
                              disabled={avancandoId === item.id}
                              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 py-1.5 text-xs font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
                            >
                              {avancandoId === item.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <ChefHat className="h-3.5 w-3.5" />}
                              {labelAvancar[item.status]}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
```

Nota sobre `agora`/`setAgora`: o estado existe só pra forçar um re-render a cada 15s, já que
`minutosDesde` lê `Date.now()` diretamente — sem esse estado, o cronômetro do card só atualizaria
quando outro evento (socket, clique) disparasse um re-render por outro motivo.

- [ ] **Step 2: Verificar compilação**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sem erros. Se o linter reclamar de `agora`/`setAgora` como não utilizados (o valor em si
não é lido no JSX, só o `setAgora` dispara o re-render), isso é esperado — o padrão é intencional
("estado gatilho"); confirme que `tsc --noEmit` (não o eslint) passa, que é o gate real deste
projeto.

- [ ] **Step 3: Testar manualmente no navegador**

Ainda sem rota/link (Task 10 adiciona isso) — navegue direto pra `http://localhost:5173/producao`
depois de logar (a rota vai dar 404/redirect até a Task 10, então adiante a Task 10 antes deste
teste, ou teste via console do navegador chamando `fetch` diretamente). **Este teste manual completo
fica combinado com o Step 3 da Task 10**, que já inclui a rota funcionando.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Producao.tsx
git commit -m "feat: página de Kanban de produção multi-setor"
```

---

### Task 10: Frontend — nav link "Produção" + rota `/producao`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`

**Interfaces:**
- Consumes: componente `Producao` (Task 9); `mostrarMesas` (flag já existente em `Layout.tsx`,
  Fase 1c — mesma checagem de permissão `mesas` + módulo `mesas`).

- [ ] **Step 1: Adicionar a rota em `frontend/src/App.tsx`**

Adicionar o import logo após o de `Mesas`:

```typescript
import Producao from './pages/Producao'
```

Adicionar a rota logo após a de `/mesas` (linha 41 hoje):

```tsx
      <Route path="/mesas"     element={<RotaPermissao permissao="mesas"><Mesas /></RotaPermissao>} />
      <Route path="/producao"  element={<RotaPermissao permissao="mesas"><Producao /></RotaPermissao>} />
```

- [ ] **Step 2: Adicionar o link de navegação em `frontend/src/components/Layout.tsx`**

Adicionar o import do ícone `ClipboardList` ao import existente de `lucide-react` (linha 4 hoje):

```typescript
import { Bell, BellOff, ChefHat, LogOut, Users, X, Table2, ClipboardList } from 'lucide-react'
```

No bloco de nav desktop (dentro de `<nav className="hidden items-center gap-1 sm:flex">`, logo
depois do link "Mesas"):

```tsx
            {mostrarMesas && (
              <NavLink to="/mesas" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <Table2 className="h-3.5 w-3.5" />
                  Mesas
                </span>
              </NavLink>
            )}
            {mostrarMesas && (
              <NavLink to="/producao" className={linkClass}>
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Produção
                </span>
              </NavLink>
            )}
```

No bloco de nav mobile (dentro de `<div className="flex items-center gap-1 overflow-x-auto ... sm:hidden">`), o mesmo padrão logo depois do link "Mesas" mobile:

```tsx
          {mostrarMesas && (
            <NavLink to="/mesas" className={linkClass}>
              <span className="flex items-center gap-1.5">
                <Table2 className="h-3.5 w-3.5" />
                Mesas
              </span>
            </NavLink>
          )}
          {mostrarMesas && (
            <NavLink to="/producao" className={linkClass}>
              <span className="flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Produção
              </span>
            </NavLink>
          )}
```

(Reaproveita o `mostrarMesas` já calculado em `Layout.tsx` na Fase 1c — nenhuma permissão nova é
criada; quem pode ver "Mesas" também vê "Produção".)

- [ ] **Step 3: Verificar compilação**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 4: Testar manualmente no navegador — fluxo completo**

Logar como `carlos@teste.com` (Pizzaria do Bairro, DONO). Confirmar que o link "Produção" aparece no
menu (desktop e mobile). Clicar nele — confirmar que a tela carrega com as 3 colunas vazias ou com
itens já existentes das fases anteriores. Adicionar um item numa mesa (tela Mesas, Fase 1c) num item
do cardápio que tenha setor atribuído — confirmar que o card aparece na coluna "Recebido" da tela de
Produção (via socket, sem reload, se a aba já estava aberta — ou via fetch se acabou de navegar).
Clicar em "Iniciar preparo" — confirmar que o card muda pra coluna "Em preparo". Repetir até
"Marcar entregue" — confirmar que o card desaparece do Kanban (mas continua visível na tela de Mesas
com status "Entregue"). Testar também como um operador com setor fixo (criar um via Operadores,
Task 3) — confirmar que ele só vê os itens do setor dele na tela de Produção.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat: link de navegação e rota da tela de Produção"
```

---

## Verificação final (antes de considerar a Fase 1d completa)

- [ ] `npx tsc --noEmit` (backend) e `cd frontend && npx tsc --noEmit` (frontend) limpos.
- [ ] `npm test` — todos os testes passam, incluindo os 6 novos desta fase (2 em
  `producao.test.ts`, 4 em `salasSocket.test.ts`).
- [ ] `cd frontend && npx vite build` sem erros.
- [ ] Confirmar em duas abas do navegador (uma logada como DONO sem setor, outra como operador com
  setor fixo) que os eventos de produção chegam só pra quem deveria — o operador com setor fixo não
  deve ver (nem via socket, nem via fetch) itens de outro setor.
- [ ] Confirmar que a tela de Cozinha (`Cozinha.tsx`) e a tela de Mesas (`Mesas.tsx`, Fase 1c)
  continuam funcionando exatamente como antes — nenhuma delas deve mudar de comportamento.
- [ ] Rodar a migration em produção (Railway) só depois do merge — `npx prisma migrate deploy`
  usando o `DATABASE_PUBLIC_URL` do Postgres do Railway, seguindo o procedimento já documentado em
  `CLAUDE.md`.
