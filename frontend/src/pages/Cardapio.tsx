import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, UtensilsCrossed } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface ItemCardapio {
  id: string
  nome: string
  descricao: string | null
  preco: number | string
  disponivel: boolean
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export default function Cardapio() {
  const token = localStorage.getItem('token')
  const [itens, setItens] = useState<ItemCardapio[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<ItemCardapio | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preco, setPreco] = useState('')
  const [disponivel, setDisponivel] = useState(true)

  useEffect(() => {
    carregarItens()
  }, [])

  async function carregarItens() {
    setCarregando(true)
    try {
      const r = await fetch(`${API_URL}/cardapio`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const dados: ItemCardapio[] = await r.json()
      if (Array.isArray(dados)) setItens(dados)
    } catch (e) {
      console.error('Erro ao carregar cardápio:', e)
    } finally {
      setCarregando(false)
    }
  }

  function abrirModalNovo() {
    setEditando(null)
    setNome('')
    setDescricao('')
    setPreco('')
    setDisponivel(true)
    setModalAberto(true)
  }

  function abrirModalEditar(item: ItemCardapio) {
    setEditando(item)
    setNome(item.nome)
    setDescricao(item.descricao ?? '')
    setPreco(String(item.preco))
    setDisponivel(item.disponivel)
    setModalAberto(true)
  }

  function fecharModal() {
    if (salvando) return
    setModalAberto(false)
  }

  async function handleSalvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)

    try {
      const body: Record<string, unknown> = {
        nome,
        preco: Number(preco),
        disponivel,
      }
      if (descricao.trim()) body.descricao = descricao.trim()

      const url = editando
        ? `${API_URL}/cardapio/${editando.id}`
        : `${API_URL}/cardapio`
      const method = editando ? 'PATCH' : 'POST'

      const r = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!r.ok) {
        const erro = await r.json().catch(() => ({}))
        throw new Error(erro.erro ?? 'Erro ao salvar')
      }

      const itemSalvo: ItemCardapio = await r.json()

      if (editando) {
        setItens((prev) => prev.map((i) => (i.id === itemSalvo.id ? itemSalvo : i)))
      } else {
        setItens((prev) => [...prev, itemSalvo])
      }

      setModalAberto(false)
    } catch (e) {
      console.error('Erro ao salvar item:', e)
      alert(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleToggleDisponivel(item: ItemCardapio) {
    setAcaoEmAndamento(item.id)
    try {
      const r = await fetch(`${API_URL}/cardapio/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ disponivel: !item.disponivel }),
      })
      if (!r.ok) throw new Error('Falha ao alterar disponibilidade')
      const atualizado: ItemCardapio = await r.json()
      setItens((prev) => prev.map((i) => (i.id === atualizado.id ? atualizado : i)))
    } catch (e) {
      console.error(e)
      alert('Não foi possível alterar a disponibilidade.')
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  async function handleDeletar(item: ItemCardapio) {
    if (!confirm(`Remover "${item.nome}" do cardápio?`)) return

    setAcaoEmAndamento(item.id)
    try {
      const r = await fetch(`${API_URL}/cardapio/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('Falha ao deletar')
      setItens((prev) => prev.filter((i) => i.id !== item.id))
    } catch (e) {
      console.error(e)
      alert('Não foi possível remover o item.')
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  return (
    <Layout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">Cardápio</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Itens que aparecem no link público do cardápio
          </p>
        </div>
        <button
          onClick={abrirModalNovo}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Novo item
        </button>
      </div>

      {carregando ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      ) : itens.length === 0 ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 text-center">
          <UtensilsCrossed className="mb-3 h-10 w-10 text-zinc-600" />
          <p className="text-lg font-semibold text-zinc-400">Cardápio vazio</p>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Adicione seu primeiro item clicando em "Novo item".
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border bg-zinc-900 p-5 transition ${
                item.disponivel
                  ? 'border-zinc-800 hover:border-zinc-700'
                  : 'border-zinc-800/50 opacity-60'
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold">{item.nome}</h3>
                  {item.descricao && (
                    <p className="mt-1 text-sm text-zinc-400 line-clamp-2">{item.descricao}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => abrirModalEditar(item)}
                    disabled={acaoEmAndamento === item.id}
                    className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeletar(item)}
                    disabled={acaoEmAndamento === item.id}
                    className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
                <span className="text-xl font-extrabold">
                  {formatarBRL(Number(item.preco))}
                </span>
                <Toggle
                  ativo={item.disponivel}
                  carregando={acaoEmAndamento === item.id}
                  onChange={() => handleToggleDisponivel(item)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <ModalForm
          editando={editando}
          nome={nome}
          descricao={descricao}
          preco={preco}
          disponivel={disponivel}
          salvando={salvando}
          onChangeNome={setNome}
          onChangeDescricao={setDescricao}
          onChangePreco={setPreco}
          onChangeDisponivel={setDisponivel}
          onFechar={fecharModal}
          onSalvar={handleSalvar}
        />
      )}
    </Layout>
  )
}

function Toggle({
  ativo,
  carregando,
  onChange,
}: {
  ativo: boolean
  carregando: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={carregando}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        ativo ? 'bg-emerald-500' : 'bg-zinc-700'
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          ativo ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function ModalForm({
  editando,
  nome,
  descricao,
  preco,
  disponivel,
  salvando,
  onChangeNome,
  onChangeDescricao,
  onChangePreco,
  onChangeDisponivel,
  onFechar,
  onSalvar,
}: {
  editando: ItemCardapio | null
  nome: string
  descricao: string
  preco: string
  disponivel: boolean
  salvando: boolean
  onChangeNome: (v: string) => void
  onChangeDescricao: (v: string) => void
  onChangePreco: (v: string) => void
  onChangeDisponivel: (v: boolean) => void
  onFechar: () => void
  onSalvar: (e: FormEvent) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold">
            {editando ? 'Editar item' : 'Novo item'}
          </h3>
          <button
            onClick={onFechar}
            disabled={salvando}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSalvar}>
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Nome</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={nome}
              onChange={(e) => onChangeNome(e.target.value)}
              placeholder="ex: Galeto Inteiro"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">
              Descrição <span className="text-zinc-500">(opcional)</span>
            </span>
            <textarea
              maxLength={500}
              value={descricao}
              onChange={(e) => onChangeDescricao(e.target.value)}
              placeholder="ex: Acompanha arroz, farofa e vinagrete"
              rows={3}
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Preço (R$)</span>
            <input
              type="number"
              required
              min={0}
              step="0.01"
              value={preco}
              onChange={(e) => onChangePreco(e.target.value)}
              placeholder="45.00"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <label className="mb-6 flex items-center gap-3">
            <Toggle
              ativo={disponivel}
              carregando={false}
              onChange={() => onChangeDisponivel(!disponivel)}
            />
            <span className="text-sm font-medium text-zinc-300">
              Disponível para o cliente
            </span>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !nome.trim() || !preco}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : editando ? (
                'Salvar'
              ) : (
                'Criar item'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}