# Redesenho do Caixa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever a tela de Caixa como fluxo guiado de recebimento: nenhum pagamento sem revisão + confirmação, forma de pagamento escolhida junto da confirmação, "Pagamento por comanda" no lugar de "Dividir por comanda".

**Architecture:** 100% frontend. `Caixa.tsx` vira orquestrador magro; a UI é dividida em componentes por responsabilidade em `frontend/src/components/caixa/`. O wizard (`ReceberPagamento.tsx`) concentra as telas ② (o que está sendo pago) e ③ (revisão + forma + QR + confirmar). Backend intocado — rotas existentes cobrem tudo.

**Tech Stack:** React 19 + Tailwind v4 + lucide-react. Sem libs novas.

**Spec:** `docs/superpowers/specs/2026-07-16-caixa-redesign-design.md`

## Global Constraints

- TypeScript strict; sem `any`, sem `@ts-ignore`; sem `console.log` novo (os `console.error` de fetch seguem o padrão atual da tela).
- Imutabilidade; mobile-first (Tailwind sem prefixo = mobile); `min-h-dvh` onde couber.
- Nenhuma mudança de backend, de rota ou de payload.
- Verificação por task: `cd frontend && npx tsc -b`.
- Commits conventional commits.

---

### Task 1: Tipos compartilhados + componentes de leitura

**Files:**
- Create: `frontend/src/components/caixa/tipos.ts`
- Create: `frontend/src/components/caixa/ResumoTotais.tsx`
- Create: `frontend/src/components/caixa/ComandasLeitura.tsx`

**Interfaces (Produces):**
- `tipos.ts`: `ItemResumo`, `ComandaResumo`, `PagamentoResumo`, `ResumoConta`, `ContaResumida` (movidos de `Caixa.tsx` sem mudança de shape), `FormaPagamento = 'pix' | 'pix_maquininha' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'`, `LABEL_FORMA_PAGAMENTO: Record<FormaPagamento, string>`, `FORMAS_PAGAMENTO: FormaPagamento[]`.
- `ResumoTotais({ resumo }: { resumo: ResumoConta })` — card de totais; quando `resumo.saldoDevedor <= 0`, borda/texto verdes e linha "Todos os pagamentos registrados ✓".
- `ComandasLeitura({ comandas }: { comandas: ComandaResumo[] })` — um card por comanda; comanda com `totalNaoPago === 0` mostra "✓ pago" no lugar do valor em aberto; item pago acinzentado "· pago", cancelado riscado.

- [ ] Escrever os três arquivos; `npx tsc -b` (vai falhar só se houver erro interno — `Caixa.tsx` ainda não os usa)
- [ ] Commit: `feat: componentes de leitura do Caixa (tipos, totais, comandas)`

### Task 2: Pagamentos registrados + desconto (extração)

**Files:**
- Create: `frontend/src/components/caixa/PagamentosRegistrados.tsx`
- Create: `frontend/src/components/caixa/FormDesconto.tsx`

**Interfaces:**
- Consumes: tipos da Task 1.
- Produces:
  - `PagamentosRegistrados({ pagamentos, contaId, token, onAtualizado }: { pagamentos: PagamentoResumo[]; contaId: string; token: string; onAtualizado: (r: ResumoConta) => void })` — lista + form de estorno inline (motivo + senha), mesma lógica/fetch de hoje (`PATCH /pagamentos/:id/estornar`), estado interno próprio.
  - `FormDesconto({ contaId, token, onAtualizado }: { contaId: string; token: string; onAtualizado: (r: ResumoConta) => void })` — botão "Aplicar desconto" + form colapsável (valor/motivo/senha), fetch de hoje (`POST /contas/:id/desconto`).

- [ ] Escrever os dois arquivos portando a lógica existente de `Caixa.tsx` (sem mudança de comportamento); `npx tsc -b`
- [ ] Commit: `feat: estorno e desconto extraídos em componentes próprios do Caixa`

### Task 3: Wizard ReceberPagamento (telas ② e ③)

**Files:**
- Create: `frontend/src/components/caixa/ReceberPagamento.tsx`

**Interfaces:**
- Consumes: tipos da Task 1; rotas `POST /contas/:id/pagamentos`, `GET /contas/:id/pix-qrcode`.
- Produces: `ReceberPagamento({ contaId, resumo, token, onAtualizado, onVoltar }: { contaId: string; resumo: ResumoConta; token: string; onAtualizado: (r: ResumoConta) => void; onVoltar: () => void })`.

**Estado interno:**

```ts
type Alvo =
  | { tipo: 'conta';   rotulo: string; itensIds: string[] | null; valor: number }
  | { tipo: 'comanda'; rotulo: string; itensIds: string[]; valor: number }
  | { tipo: 'itens';   rotulo: string; itensIds: string[]; valor: number }
  | { tipo: 'parcela'; rotulo: string; itensIds: null; valor: number; pessoas: number; parcelaAtual: number }
  | { tipo: 'livre';   rotulo: string; itensIds: null; valor: number }

type Etapa = 'escolha' | 'itens' | 'pessoas' | 'livre' | 'revisao'
```

**Regras (da spec):**
- Conta toda: `itensIds` = todos não pagos quando `descontoValor === 0`; senão `itensIds: null` e `valor: saldoDevedor`.
- Comanda quitada aparece desabilitada "✓ já pago" na escolha.
- Parcela: `valor = arred2(saldoDevedor / pessoas)`; após confirmar, se `parcelaAtual < pessoas` e o novo `saldoDevedor > 0`, monta a próxima: `valor = arred2(novoSaldo / (pessoas - parcelaAtual))`, `parcelaAtual + 1`, permanece em `revisao` (forma de pagamento re-escolhível); senão `onVoltar()`.
- Revisão: pílulas de forma (default `pix`), lista de itens quando `itensIds`, botão "Mostrar QR code Pix de R$ X" (gera com `alvo.valor`), botão `Confirmar R$ X em <forma>` → POST com `{ formaPagamento, itensComandaIds }` ou `{ formaPagamento, valor }`; sucesso → `onAtualizado(resposta)` e navegação conforme acima.
- Header de cada etapa tem "←" (escolha → `onVoltar()`; demais → volta pra etapa anterior).

- [ ] Escrever o componente; `npx tsc -b`
- [ ] Commit: `feat: wizard de recebimento do Caixa — revisão e confirmação antes de registrar`

### Task 4: Reescrever Caixa.tsx (telas ① e ④ + orquestração)

**Files:**
- Modify: `frontend/src/pages/Caixa.tsx` (reescrita completa)

**Comportamento:**
- Grade de contas: igual hoje.
- Tela da conta: `ResumoTotais` + `ComandasLeitura` + botão primário "Receber pagamento" (só com `saldoDevedor > 0`) que monta `<ReceberPagamento>` em tela cheia (substitui o conteúdo da conta enquanto aberto) + `PagamentosRegistrados` + `FormDesconto` + fechar conta.
- Fechar conta: com `podeFechar`, botão verde primário "Fechar conta e liberar a mesa"; senão desabilitado com hint "Saldo devedor pendente". Erro do backend exibido embaixo (ex.: itens em produção).
- Socket `conta:atualizada` recarrega o resumo da conta aberta (igual hoje) — inclusive com o wizard aberto (o resumo é prop do wizard; o `alvo` em revisão NÃO é recalculado — se o backend recusar por item já pago, o erro aparece na revisão, comportamento aceitável).
- `npx tsc -b` + confirmar que nenhum código morto da tela antiga sobrou.

- [ ] Reescrever; `npx tsc -b`
- [ ] Commit: `feat: tela de Caixa reescrita com fluxo guiado de recebimento`

### Task 5: Verificação ao vivo + docs + push

- [ ] Backend + frontend locais; conta de teste com 2 comandas e 3+ itens; percorrer: conta toda, por comanda (inclusive comanda já paga desabilitada), itens específicos, 3 parcelas com formas diferentes (conferir que a última zera o saldo exato), valor livre, QR code com valor travado, desconto (conta toda com desconto → paga por valor), estorno reabrindo, fechar com item em produção (422) e fechar ok.
- [ ] Atualizar "Log de mudanças" do `CLAUDE.md`; limpar dados de teste.
- [ ] `git pull --rebase && git push`.
