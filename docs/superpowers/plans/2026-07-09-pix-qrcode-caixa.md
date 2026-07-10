# PIX com QR Code na Tela de Caixa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a caixa generate a real, scannable PIX QR code (and "copia e cola" string) for a
specific amount directly from the account-closing screen, using the establishment's own PIX
key — no payment gateway, no external account, works with any bank's app on the customer's
phone. The card machine ("maquininha") stays completely external and untouched; the garçom
still confirms payment manually afterward, exactly as today.

**Architecture:** This is a **static PIX QR code** ("Pix Copia e Cola" / BR Code, the Banco
Central EMV-based standard), generated entirely locally — no external API call, no merchant
account with any payment provider, no webhook. A pure function builds the standardized text
payload from the establishment's PIX key + name + city + the amount, then the existing
`qrcode` npm package (already a backend dependency, currently only used for the WhatsApp
pairing QR in `src/whatsapp.ts`) renders that payload as a QR code image. The frontend just
displays the image and the copyable text — registering the payment once money arrives is
still the existing manual flow from Fase 1e, completely unchanged.

**Tech Stack:** Node 22, TypeScript, Fastify 5, Prisma 7 (backend); React 19, Vite, Tailwind
(frontend). No new dependencies — `qrcode` and `@types/qrcode` are already installed.

## Global Constraints

- This explicitly does **not** integrate with any card machine, payment gateway, or external
  merchant account. It only generates a QR code from data the establishment already
  controls (`Estabelecimento.chavePix`, already exists). Do not add any provider SDK, OAuth
  flow, or webhook — that would be a different, much larger initiative (see the plan's
  history/discussion — deliberately out of scope here, and inherently incompatible with
  staying provider-agnostic across card machine brands).
- The PIX payload format follows the Banco Central "BR Code" standard (EMV Merchant
  Presented Mode, adapted for Pix): a sequence of TLV (Tag-Length-Value) fields ending in a
  CRC16 checksum. Field IDs and exact structure are given in Task 2 — follow them exactly,
  this is a standardized format that must match what every Brazilian banking app expects to
  parse, not a place for creative reinterpretation.
- Merchant name and city fields in the BR Code standard must be ASCII, uppercase, and
  length-capped (name ≤ 25 chars, city ≤ 15 chars) — Task 2's `normalizarTexto` handles this
  (strips accents, uppercases, truncates). Never pass raw `Estabelecimento.nome`/`cidade`
  into the payload without normalizing first.
- QR generation requires both `Estabelecimento.chavePix` and the new `Estabelecimento.cidade`
  field to be configured — reject with a clear 400 message (mirroring the existing
  `senhaReabrirPedido`-not-configured pattern from Fase 1e/1f) if either is missing, rather
  than silently generating a malformed or misleading code.
- This feature is purely additive to the Caixa screen — it does not touch, replace, or
  change the existing payment-registration flow (`POST /contas/:id/pagamentos`,
  `registrarPagamento`, the "dividir por comanda/igualmente/itens/valor livre" UI). The
  garçom/caixa still clicks the existing "Registrar" buttons after the customer pays; showing
  the QR code is a separate, independent action with its own amount input.

---

## File Structure

- **`prisma/schema.prisma`** (modify) — add `Estabelecimento.cidade String?`.
- **`src/utils/pixBrCode.ts`** (create) — pure functions: `gerarPayloadPix`, plus internal
  helpers (`normalizarTexto`, `calcularCRC16`). No Prisma/database import, matching the
  precedent of `src/utils/fechamentoConta.ts`.
- **`src/utils/pixBrCode.test.ts`** (create) — unit tests, including a self-consistency CRC
  check and a hand-rolled TLV round-trip parser (see Task 2 — this avoids relying on a
  hardcoded "known-good" payload the implementer can't independently verify).
- **`src/routes/pagamentos.ts`** (modify) — new `GET /contas/:id/pix-qrcode` route.
- **`src/routes/estabelecimentos.ts`** (modify) — `AtualizarEstabelecimentoSchema` gains
  `cidade`.
- **`frontend/src/pages/Configuracoes.tsx`** (modify) — new "Cidade" input next to the
  existing "Chave Pix" field.
- **`frontend/src/pages/Caixa.tsx`** (modify) — new "Mostrar QR code PIX" section with its
  own amount input, calling the new route and rendering the image + copyable text.

---

### Task 1: Schema — campo `cidade` no Estabelecimento

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Estabelecimento.cidade: String?` — consumed by Task 3 (backend route) and
  Task 4 (Configurações screen).

- [ ] **Step 1: Add the field to the `Estabelecimento` model**

Open `prisma/schema.prisma` and find, inside `model Estabelecimento`:

```prisma
  chavePix         String?
  taxaEntrega      Decimal?              @db.Decimal(10, 2)
```

Change to:

```prisma
  chavePix         String?
  cidade           String?
  taxaEntrega      Decimal?              @db.Decimal(10, 2)
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --name estabelecimento_cidade`

Expected: a new folder under `prisma/migrations/` with `migration.sql` containing:

```sql
-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "cidade" TEXT;
```

and `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: adiciona campo cidade no Estabelecimento"
```

---

### Task 2: Função pura de geração do payload Pix (BR Code)

**Files:**
- Create: `src/utils/pixBrCode.ts`
- Test: `src/utils/pixBrCode.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no Prisma import).
- Produces (used by Task 3's route handler):

```typescript
export interface DadosPixEstatico {
  chavePix: string;
  nomeBeneficiario: string;
  cidade: string;
  valor: number;
  txid: string;
}

export function gerarPayloadPix(dados: DadosPixEstatico): string;
```

- [ ] **Step 1: Write the failing tests**

Create `src/utils/pixBrCode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { gerarPayloadPix } from './pixBrCode.js';

// Parser TLV mínimo, só para os testes — confirma que o payload gerado é
// estruturalmente válido lendo ele de volta, em vez de comparar com um valor
// mágico decorado (nenhuma fonte externa foi usada pra gerar um "gabarito").
function parsearTlv(payload: string): Record<string, string> {
  const campos: Record<string, string> = {};
  let pos = 0;
  while (pos < payload.length) {
    const id = payload.slice(pos, pos + 2);
    const tamanho = Number(payload.slice(pos + 2, pos + 4));
    const valor = payload.slice(pos + 4, pos + 4 + tamanho);
    campos[id] = valor;
    pos += 4 + tamanho;
  }
  return campos;
}

function calcularCRC16ParaTeste(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

describe('gerarPayloadPix', () => {
  const dadosBase = {
    chavePix: 'contato@pizzariadobairro.com.br',
    nomeBeneficiario: 'Pizzaria do Bairro',
    cidade: 'São Paulo',
    valor: 38,
    txid: 'b93f8f82-b236-45b4-9def-ae457dbe39ba',
  };

  it('gera um payload cuja estrutura TLV é internamente consistente', () => {
    const payload = gerarPayloadPix(dadosBase);
    const campos = parsearTlv(payload.slice(0, -4)); // tudo exceto os 4 dígitos do CRC

    expect(campos['00']).toBe('01'); // payload format indicator
    expect(campos['52']).toBe('0000'); // merchant category code
    expect(campos['53']).toBe('986'); // moeda BRL
    expect(campos['54']).toBe('38.00'); // valor
    expect(campos['58']).toBe('BR'); // país
    expect(campos['59']).toBe('PIZZARIA DO BAIRRO'); // nome normalizado
    expect(campos['60']).toBe('SAO PAULO'); // cidade normalizada (sem acento)
  });

  it('o campo 26 (merchant account information) contém o GUI do Pix e a chave', () => {
    const payload = gerarPayloadPix(dadosBase);
    const campos = parsearTlv(payload.slice(0, -4));
    const subcampos = parsearTlv(campos['26']);

    expect(subcampos['00']).toBe('br.gov.bcb.pix');
    expect(subcampos['01']).toBe('contato@pizzariadobairro.com.br');
  });

  it('o campo 62 (dados adicionais) contém o txid sanitizado (só alfanumérico, até 25 chars)', () => {
    const payload = gerarPayloadPix(dadosBase);
    const campos = parsearTlv(payload.slice(0, -4));
    const subcampos = parsearTlv(campos['62']);

    expect(subcampos['05']).toBe('b93f8f82b23645b49defae457dbe39ba'.slice(0, 25));
  });

  it('o CRC16 nos últimos 4 caracteres bate com o recalculado sobre o restante do payload', () => {
    const payload = gerarPayloadPix(dadosBase);
    const semCrc = payload.slice(0, -4);
    const crcInformado = payload.slice(-4);

    expect(crcInformado).toBe(calcularCRC16ParaTeste(semCrc + '6304'));
  });

  it('trunca nome do beneficiário em 25 caracteres e cidade em 15', () => {
    const payload = gerarPayloadPix({
      ...dadosBase,
      nomeBeneficiario: 'Um Nome de Estabelecimento Bem Comprido Demais',
      cidade: 'Uma Cidade Com Nome Bem Longo',
    });
    const campos = parsearTlv(payload.slice(0, -4));

    expect(campos['59'].length).toBeLessThanOrEqual(25);
    expect(campos['60'].length).toBeLessThanOrEqual(15);
  });

  it('formata valores com centavos corretamente', () => {
    const payload = gerarPayloadPix({ ...dadosBase, valor: 12.5 });
    const campos = parsearTlv(payload.slice(0, -4));

    expect(campos['54']).toBe('12.50');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/pixBrCode.test.ts`
Expected: FAIL — `Cannot find module './pixBrCode.js'`

- [ ] **Step 3: Implement `src/utils/pixBrCode.ts`**

```typescript
export interface DadosPixEstatico {
  chavePix: string;
  nomeBeneficiario: string;
  cidade: string;
  valor: number;
  txid: string;
}

function tlv(id: string, valor: string): string {
  const tamanho = valor.length.toString().padStart(2, '0');
  return `${id}${tamanho}${valor}`;
}

const REGEX_MARCAS_DIACRITICAS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizarTexto(texto: string, tamanhoMaximo: number): string {
  return texto
    .normalize('NFD')
    .replace(REGEX_MARCAS_DIACRITICAS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, tamanhoMaximo);
}

function calcularCRC16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function gerarPayloadPix(dados: DadosPixEstatico): string {
  const nome = normalizarTexto(dados.nomeBeneficiario, 25);
  const cidade = normalizarTexto(dados.cidade, 15);
  const txid = (dados.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***');

  const merchantAccountInfo = tlv('00', 'br.gov.bcb.pix') + tlv('01', dados.chavePix);

  const payloadSemCrc =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', dados.valor.toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', nome) +
    tlv('60', cidade) +
    tlv('62', tlv('05', txid)) +
    '6304';

  return payloadSemCrc + calcularCRC16(payloadSemCrc);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/pixBrCode.test.ts`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/utils/pixBrCode.ts src/utils/pixBrCode.test.ts
git commit -m "feat: gerador de payload Pix estático (BR Code)"
```

---

### Task 3: Rota de geração do QR code

**Files:**
- Modify: `src/routes/pagamentos.ts`

**Interfaces:**
- Consumes: `gerarPayloadPix` from `../utils/pixBrCode.js` (Task 2); `qrcode` npm package
  (already a dependency).
- Produces: `GET /contas/:id/pix-qrcode?valor=X` → `200 { payload: string, qrCodeBase64:
  string }`. Consumed by Task 5 (`Caixa.tsx`).

- [ ] **Step 1: Add the `qrcode` import and query schema**

In `src/routes/pagamentos.ts`, find:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import { prisma } from '../database.js';
```

Change to:

```typescript
import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import bcrypt from 'bcrypt';
import QRCode from 'qrcode';
import { prisma } from '../database.js';
import { gerarPayloadPix } from '../utils/pixBrCode.js';
```

Find:

```typescript
const ContaParamsSchema = Type.Object({ id: Type.String() });
const PagamentoParamsSchema = Type.Object({ id: Type.String() });
```

Add right after it:

```typescript

const PixQrCodeQuerySchema = Type.Object({
  valor: Type.String(),
});
```

- [ ] **Step 2: Add the `GET /contas/:id/pix-qrcode` route**

Find the closing brace at the very end of the file — the last route registered (search for
the final `}` that closes `export async function pagamentosRoutes`). Add the new route right
before that final closing brace, after the last existing route's closing `});`:

```typescript
  // ── GET /contas/:id/pix-qrcode ───────────────────────────────────────────────
  // Gera um QR code Pix estático (BR Code) local — sem gateway, sem conta em nenhum
  // provedor. O garçom/caixa ainda confirma o pagamento manualmente depois, via
  // POST /contas/:id/pagamentos, exatamente como hoje.
  fastify.get('/contas/:id/pix-qrcode', {
    onRequest: [autenticar, temPermissao('mesas', 'caixa'), moduloAtivo('mesas')],
    schema: { params: ContaParamsSchema, querystring: PixQrCodeQuerySchema },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { valor: valorStr } = request.query as { valor: string };
    const { estabelecimentoId } = request.user;

    const valor = Number(valorStr);
    if (!(valor > 0)) return reply.status(400).send({ erro: 'Valor inválido' });

    const conta = await prisma.conta.findFirst({ where: { id, estabelecimentoId: estabelecimentoId! } });
    if (!conta) return reply.status(404).send({ erro: 'Conta não encontrada' });

    const estabelecimento = await prisma.estabelecimento.findUnique({ where: { id: estabelecimentoId! } });
    if (!estabelecimento?.chavePix) {
      return reply.status(400).send({ erro: 'Configure a chave Pix em Configurações antes de gerar o QR code' });
    }
    if (!estabelecimento.cidade) {
      return reply.status(400).send({ erro: 'Configure a cidade do estabelecimento em Configurações antes de gerar o QR code' });
    }

    const payload = gerarPayloadPix({
      chavePix: estabelecimento.chavePix,
      nomeBeneficiario: estabelecimento.nome,
      cidade: estabelecimento.cidade,
      valor,
      txid: id,
    });

    const qrCodeBase64 = await QRCode.toDataURL(payload);

    return { payload, qrCodeBase64 };
  });
}
```

- [ ] **Step 3: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Manual verification with curl**

Start the dev server. First configure `chavePix` and `cidade` for a test establishment (via
`PATCH /meu-estabelecimento` — Task 4's route change must be in place, or set both fields
directly for now if testing this task in isolation before Task 4 lands — either works since
this task only reads those fields).

```bash
curl -s "http://localhost:3000/contas/<CONTA_ID>/pix-qrcode?valor=38" \
  -H "Authorization: Bearer <TOKEN>" | jq
```

Expected: `200`, `payload` is a long alphanumeric string starting with `000201...` and ending
in 4 uppercase hex characters, `qrCodeBase64` starts with `data:image/png;base64,`. Paste the
`payload` value into a Pix "copia e cola" field in any real banking app (without completing
the payment) to visually confirm it's recognized as a valid Pix code showing the right
establishment name and amount.

```bash
# Sem chavePix configurada:
curl -s "http://localhost:3000/contas/<CONTA_ID>/pix-qrcode?valor=38" \
  -H "Authorization: Bearer <TOKEN_SEM_CHAVE_CONFIGURADA>" -w "\nHTTP %{http_code}\n"
```
Expected: `400 {"erro":"Configure a chave Pix em Configurações antes de gerar o QR code"}`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/pagamentos.ts
git commit -m "feat: rota de geração do QR code Pix na conta"
```

---

### Task 4: Campo "Cidade" em Configurações

**Files:**
- Modify: `src/routes/estabelecimentos.ts`
- Modify: `frontend/src/pages/Configuracoes.tsx`

**Interfaces:**
- Consumes: `Estabelecimento.cidade` (Task 1).
- Produces: `PATCH /meu-estabelecimento` accepts `cidade`; Configurações screen has a field
  for it, saved alongside `chavePix`.

- [ ] **Step 1: Add `cidade` to the backend schema**

In `src/routes/estabelecimentos.ts`, find:

```typescript
const AtualizarEstabelecimentoSchema = Type.Object({
  aceitandoPedidos: Type.Optional(Type.Boolean()),
  nome:             Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  telefone:         Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
  chavePix:         Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  taxaEntrega:      Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  evolutionUrl:     Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  evolutionToken:   Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
});
```

Change to:

```typescript
const AtualizarEstabelecimentoSchema = Type.Object({
  aceitandoPedidos: Type.Optional(Type.Boolean()),
  nome:             Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  telefone:         Type.Optional(Type.String({ minLength: 8, maxLength: 20 })),
  chavePix:         Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  cidade:           Type.Optional(Type.Union([Type.String({ maxLength: 100 }), Type.Null()])),
  taxaEntrega:      Type.Optional(Type.Union([Type.Number({ minimum: 0 }), Type.Null()])),
  evolutionUrl:     Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  evolutionToken:   Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
});
```

Find:

```typescript
    const dados = request.body as {
      aceitandoPedidos?: boolean;
      nome?:             string;
      telefone?:         string;
      chavePix?:         string | null;
    };
```

Change to:

```typescript
    const dados = request.body as {
      aceitandoPedidos?: boolean;
      nome?:             string;
      telefone?:         string;
      chavePix?:         string | null;
      cidade?:           string | null;
    };
```

- [ ] **Step 2: Add the "Cidade" field to `Configuracoes.tsx`**

Find:

```tsx
interface Estabelecimento {
  id:               string
  nome:             string
  telefone:         string
  slug:             string
  status:           string
  aceitandoPedidos: boolean
  chavePix:         string | null
  taxaEntrega:      number | null
  senhaReabrirPedidoConfigurada: boolean
}
```

Change to:

```tsx
interface Estabelecimento {
  id:               string
  nome:             string
  telefone:         string
  slug:             string
  status:           string
  aceitandoPedidos: boolean
  chavePix:         string | null
  cidade:           string | null
  taxaEntrega:      number | null
  senhaReabrirPedidoConfigurada: boolean
}
```

Find:

```tsx
  const [chavePix, setChavePix]       = useState('')
```

Change to:

```tsx
  const [chavePix, setChavePix]       = useState('')
  const [cidade, setCidade]           = useState('')
```

Find:

```tsx
        setChavePix(est.chavePix ?? '')
```

Change to:

```tsx
        setChavePix(est.chavePix ?? '')
        setCidade(est.cidade ?? '')
```

Find:

```tsx
          chavePix:    chavePix.trim() || null,
          taxaEntrega: taxaNum,
```

Change to:

```tsx
          chavePix:    chavePix.trim() || null,
          cidade:      cidade.trim() || null,
          taxaEntrega: taxaNum,
```

Find the input for `chavePix` (search for `type="text" value={chavePix}`):

```tsx
              type="text" value={chavePix} onChange={(e) => setChavePix(e.target.value)}
```

Read the surrounding 10 lines above and below this line to see the full `<label>` block it
belongs to, then add a new, near-identical `<label>` block for "Cidade" right after that
block closes, following the exact same JSX shape (label text, input styling classes) already
used for the Chave Pix field in that file — substitute `cidade`/`setCidade` and the label
text "Cidade" with a helper caption: "Usada no QR code Pix gerado na tela de Caixa (mesa)."

- [ ] **Step 3: Type-check both**

Run: `npx tsc --noEmit && cd frontend && npx tsc --noEmit`
Expected: no errors in either.

- [ ] **Step 4: Commit**

```bash
git add src/routes/estabelecimentos.ts frontend/src/pages/Configuracoes.tsx
git commit -m "feat: campo cidade em Configurações"
```

---

### Task 5: Mostrar QR code PIX na tela de Caixa

**Files:**
- Modify: `frontend/src/pages/Caixa.tsx`

**Interfaces:**
- Consumes: `GET /contas/:id/pix-qrcode?valor=X` (Task 3).
- Produces: a "Mostrar QR code PIX" section in the conta-detail view, independent of the
  existing payment-registration flow.

- [ ] **Step 1: Add the `QrCode` icon import and QR-code state**

Find:

```tsx
import { Loader2, Wallet, Users, CheckCircle2, Percent, Undo2, Lock } from 'lucide-react'
```

Change to:

```tsx
import { Loader2, Wallet, Users, CheckCircle2, Percent, Undo2, Lock, QrCode } from 'lucide-react'
```

Find:

```tsx
  const [fechandoConta, setFechandoConta] = useState(false)
  const [erroFechar, setErroFechar] = useState<string | null>(null)
```

Add right after it:

```tsx

  const [valorQrCode, setValorQrCode] = useState('')
  const [qrCodeGerado, setQrCodeGerado] = useState<{ payload: string; qrCodeBase64: string } | null>(null)
  const [gerandoQrCode, setGerandoQrCode] = useState(false)
  const [erroQrCode, setErroQrCode] = useState<string | null>(null)
  const [copiadoQrCode, setCopiadoQrCode] = useState(false)
```

- [ ] **Step 2: Add the QR-code generation handler**

Find:

```tsx
  async function fecharConta() {
```

Add right before it:

```tsx
  async function gerarQrCodePix() {
    if (!contaSelecionada) return
    const valor = Number(valorQrCode)
    if (!(valor > 0)) return
    setErroQrCode(null)
    setGerandoQrCode(true)
    setQrCodeGerado(null)
    setCopiadoQrCode(false)
    try {
      const resp = await fetch(`${API_URL}/contas/${contaSelecionada.id}/pix-qrcode?valor=${valor}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      if (!resp.ok) { setErroQrCode(data.erro ?? 'Não foi possível gerar o QR code'); return }
      setQrCodeGerado(data)
    } catch {
      setErroQrCode('Falha de conexão')
    } finally {
      setGerandoQrCode(false)
    }
  }

  function copiarPayloadPix() {
    if (!qrCodeGerado) return
    navigator.clipboard.writeText(qrCodeGerado.payload)
    setCopiadoQrCode(true)
    setTimeout(() => setCopiadoQrCode(false), 2000)
  }

```

- [ ] **Step 3: Add the "Mostrar QR code PIX" section**

Find (the opening of the "Registrar pagamento" block, right after the forma-de-pagamento
selector and its error message):

```tsx
                  {erroPagamento && <p className="text-sm text-red-400">{erroPagamento}</p>}

                  {/* Dividir por comanda */}
```

Change to:

```tsx
                  {erroPagamento && <p className="text-sm text-red-400">{erroPagamento}</p>}

                  {/* QR code Pix — independente da forma de pagamento selecionada acima;
                      só gera o código pra mostrar ao cliente, quem confirma o pagamento
                      continua sendo o garçom/caixa manualmente, como sempre. */}
                  <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                      <QrCode className="h-3.5 w-3.5" /> QR code Pix (sem maquininha)
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={valorQrCode}
                        onChange={(e) => setValorQrCode(e.target.value)}
                        placeholder={resumo.saldoDevedor.toFixed(2)}
                        className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={gerarQrCodePix}
                        disabled={gerandoQrCode || !valorQrCode}
                        className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
                      >
                        Gerar QR code
                      </button>
                    </div>
                    {erroQrCode && <p className="mt-2 text-sm text-red-400">{erroQrCode}</p>}
                    {qrCodeGerado && (
                      <div className="mt-3 flex flex-col items-center gap-2">
                        <img src={qrCodeGerado.qrCodeBase64} alt="QR code Pix" className="h-48 w-48 rounded-lg bg-white p-2" />
                        <button
                          onClick={copiarPayloadPix}
                          className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-600"
                        >
                          {copiadoQrCode ? <CheckCircle2 className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />}
                          {copiadoQrCode ? 'Copiado!' : 'Copiar código Pix'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dividir por comanda */}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Caixa.tsx
git commit -m "feat: gerar QR code Pix na tela de Caixa"
```

---

## End-to-End Verification (after all tasks)

1. Em Configurações, cadastrar uma chave Pix e uma cidade (ex: "São Paulo").
2. Abrir uma mesa, lançar um item, ir em Caixa → abrir a conta.
3. Digitar um valor no campo "QR code Pix" e clicar "Gerar QR code" — confirmar que aparece
   uma imagem de QR code e o botão "Copiar código Pix".
4. Escanear o QR code com o app do banco de um celular de teste (sem concluir o pagamento) —
   confirmar que o app do banco reconhece como um Pix válido, mostrando o nome do
   estabelecimento e o valor corretos.
5. Copiar o código via "Copiar código Pix" e colar no campo "Pix Copia e Cola" de um app de
   banco — mesma confirmação visual.
6. Confirmar que nada no fluxo existente de registrar pagamento (dividir por
   comanda/igualmente/itens/valor livre) mudou — o QR code é só um complemento visual, quem
   registra o pagamento em si continua sendo o garçom clicando nos botões de sempre.
7. Tentar gerar o QR code num estabelecimento sem chave Pix configurada — confirmar a
   mensagem de erro clara pedindo pra configurar em Configurações.
