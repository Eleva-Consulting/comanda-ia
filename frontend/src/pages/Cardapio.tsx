import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, UtensilsCrossed, Camera, ImageOff, Tag } from 'lucide-react'
import Layout from '../components/Layout'
import { API_URL } from '../lib/api'

interface Categoria {
  id: string
  nome: string
  ordem: number
}

interface ItemCardapio {
  id: string
  nome: string
  descricao: string | null
  preco: number | string
  disponivel: boolean
  foto: string | null
  categoriaId: string | null
  categoria: { id: string; nome: string; ordem: number } | null
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Cardapio() {
  const token = localStorage.getItem('token')
  const [itens, setItens] = useState<ItemCardapio[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<ItemCardapio | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preco, setPreco] = useState('')
  const [disponivel, setDisponivel] = useState(true)
  const [categoriaId, setCategoriaId] = useState<string>('')

  const [modalCategoriaAberto, setModalCategoriaAberto] = useState(false)
  const [editandoCategoria, setEditandoCategoria] = useState<Categoria | null>(null)
  const [nomeCategoria, setNomeCategoria] = useState('')
  const [salvandoCategoria, setSalvandoCategoria] = useState(false)

  const fotoInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [uploadandoFotoId, setUploadandoFotoId] = useState<string | null>(null)

  useEffect(() => {
    carregarTudo()
  }, [])

  async function carregarTudo() {
    setCarregando(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [rItens, rCats] = await Promise.all([
        fetch(`${API_URL}/cardapio`, { headers }),
        fetch(`${API_URL}/cardapio/categorias`, { headers }),
      ])
      const dadosItens: ItemCardapio[] = await rItens.json()
      const dadosCats: Categoria[]     = await rCats.json()
      if (Array.isArray(dadosItens)) setItens(dadosItens)
      if (Array.isArray(dadosCats))  setCategorias(dadosCats)
    } catch (e) {
      console.error('Erro ao carregar cardápio:', e)
    } finally {
      setCarregando(false)
    }
  }

  // ── Itens agrupados por categoria ────────────────────────────────────────
  const grupos = (() => {
    const comCategoria = categorias
      .map((cat) => ({
        id:    cat.id,
        nome:  cat.nome,
        ordem: cat.ordem,
        itens: itens.filter((i) => i.categoriaId === cat.id),
      }))
      .filter((g) => g.itens.length > 0)

    const semCategoria = itens.filter((i) => !i.categoriaId)

    return [
      ...comCategoria,
      ...(semCategoria.length > 0
        ? [{ id: '__sem__', nome: 'Sem categoria', ordem: Infinity, itens: semCategoria }]
        : []),
    ]
  })()

  // ── Modal de item ────────────────────────────────────────────────────────
  function abrirModalNovo() {
    setEditando(null)
    setNome('')
    setDescricao('')
    setPreco('')
    setDisponivel(true)
    setCategoriaId('')
    setModalAberto(true)
  }

  function abrirModalEditar(item: ItemCardapio) {
    setEditando(item)
    setNome(item.nome)
    setDescricao(item.descricao ?? '')
    setPreco(String(item.preco))
    setDisponivel(item.disponivel)
    setCategoriaId(item.categoriaId ?? '')
    setModalAberto(true)
  }

  async function handleSalvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const body: Record<string, unknown> = { nome, preco: Number(preco), disponivel }
      if (descricao.trim()) body.descricao = descricao.trim()
      body.categoriaId = categoriaId || null

      const url    = editando ? `${API_URL}/cardapio/${editando.id}` : `${API_URL}/cardapio`
      const method = editando ? 'PATCH' : 'POST'

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const erro = await r.json().catch(() => ({}))
        throw new Error(erro.erro ?? 'Erro ao salvar')
      }
      const itemSalvo: ItemCardapio = await r.json()
      setItens((prev) =>
        editando
          ? prev.map((i) => (i.id === itemSalvo.id ? itemSalvo : i))
          : [...prev, itemSalvo],
      )
      setModalAberto(false)
    } catch (e) {
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ disponivel: !item.disponivel }),
      })
      if (!r.ok) throw new Error()
      const atualizado: ItemCardapio = await r.json()
      setItens((prev) => prev.map((i) => (i.id === atualizado.id ? atualizado : i)))
    } catch {
      alert('Não foi possível alterar a disponibilidade.')
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  async function handleUploadFoto(item: ItemCardapio, arquivo: File) {
    if (!arquivo.type.startsWith('image/')) { alert('Selecione uma imagem (JPEG, PNG ou WEBP).'); return }
    if (arquivo.size > 5 * 1024 * 1024)    { alert('A imagem deve ter no máximo 5 MB.'); return }

    setUploadandoFotoId(item.id)
    try {
      const form = new FormData()
      form.append('foto', arquivo)
      const r = await fetch(`${API_URL}/cardapio/${item.id}/foto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.erro ?? 'Erro') }
      const atualizado: ItemCardapio = await r.json()
      setItens((prev) => prev.map((i) => (i.id === atualizado.id ? atualizado : i)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Não foi possível enviar a foto.')
    } finally {
      setUploadandoFotoId(null)
    }
  }

  async function handleRemoverFoto(item: ItemCardapio) {
    if (!confirm(`Remover a foto de "${item.nome}"?`)) return
    setUploadandoFotoId(item.id)
    try {
      const r = await fetch(`${API_URL}/cardapio/${item.id}/foto`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error()
      const atualizado: ItemCardapio = await r.json()
      setItens((prev) => prev.map((i) => (i.id === atualizado.id ? atualizado : i)))
    } catch {
      alert('Não foi possível remover a foto.')
    } finally {
      setUploadandoFotoId(null)
    }
  }

  async function handleDeletar(item: ItemCardapio) {
    if (!confirm(`Remover "${item.nome}" do cardápio?`)) return
    setAcaoEmAndamento(item.id)
    try {
      const r = await fetch(`${API_URL}/cardapio/${item.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error()
      setItens((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      alert('Não foi possível remover o item.')
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  // ── Modal de categoria ───────────────────────────────────────────────────
  function abrirModalNovaCategoria() {
    setEditandoCategoria(null)
    setNomeCategoria('')
    setModalCategoriaAberto(true)
  }

  function abrirModalEditarCategoria(cat: Categoria) {
    setEditandoCategoria(cat)
    setNomeCategoria(cat.nome)
    setModalCategoriaAberto(true)
  }

  async function handleSalvarCategoria(e: FormEvent) {
    e.preventDefault()
    setSalvandoCategoria(true)
    try {
      const url    = editandoCategoria
        ? `${API_URL}/cardapio/categorias/${editandoCategoria.id}`
        : `${API_URL}/cardapio/categorias`
      const method = editandoCategoria ? 'PATCH' : 'POST'
      const ordem  = editandoCategoria ? undefined : categorias.length

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nome: nomeCategoria.trim(), ...(ordem !== undefined && { ordem }) }),
      })
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err.erro ?? 'Erro') }
      const salva: Categoria = await r.json()

      setCategorias((prev) =>
        editandoCategoria
          ? prev.map((c) => (c.id === salva.id ? salva : c))
          : [...prev, salva],
      )
      setModalCategoriaAberto(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvandoCategoria(false)
    }
  }

  async function handleDeletarCategoria(cat: Categoria) {
    const itensNaCategoria = itens.filter((i) => i.categoriaId === cat.id).length
    const aviso = itensNaCategoria > 0
      ? `A categoria "${cat.nome}" tem ${itensNaCategoria} ${itensNaCategoria === 1 ? 'item' : 'itens'}. Eles ficarão sem categoria. Continuar?`
      : `Remover a categoria "${cat.nome}"?`
    if (!confirm(aviso)) return

    try {
      const r = await fetch(`${API_URL}/cardapio/categorias/${cat.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error()
      setCategorias((prev) => prev.filter((c) => c.id !== cat.id))
      setItens((prev) =>
        prev.map((i) => (i.categoriaId === cat.id ? { ...i, categoriaId: null, categoria: null } : i)),
      )
    } catch {
      alert('Não foi possível remover a categoria.')
    }
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
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

      {/* ── Seção de categorias ── */}
      <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Tag className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-300">Categorias</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {categorias.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-zinc-200"
            >
              <span>{cat.nome}</span>
              <button
                onClick={() => abrirModalEditarCategoria(cat)}
                className="ml-0.5 rounded p-0.5 text-zinc-400 transition hover:text-zinc-100"
                title="Renomear"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDeletarCategoria(cat)}
                className="rounded p-0.5 text-zinc-400 transition hover:text-red-400"
                title="Remover"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={abrirModalNovaCategoria}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-zinc-700 px-3 py-1 text-sm text-zinc-400 transition hover:border-orange-500 hover:text-orange-400"
          >
            <Plus className="h-3 w-3" />
            Nova categoria
          </button>
        </div>
      </div>

      {/* ── Lista de itens ── */}
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
        <div className="space-y-8">
          {grupos.map((grupo) => (
            <div key={grupo.id}>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                <Tag className="h-3.5 w-3.5" />
                {grupo.nome}
                <span className="text-zinc-700">({grupo.itens.length})</span>
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grupo.itens.map((item) => {
                  const ocupado = acaoEmAndamento === item.id || uploadandoFotoId === item.id
                  return (
                    <div
                      key={item.id}
                      className={`overflow-hidden rounded-2xl border bg-zinc-900 transition ${
                        item.disponivel
                          ? 'border-zinc-800 hover:border-zinc-700'
                          : 'border-zinc-800/50 opacity-60'
                      }`}
                    >
                      {/* Foto */}
                      <div className="group relative h-40 bg-zinc-800">
                        {item.foto ? (
                          <img src={item.foto} alt={item.nome} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <UtensilsCrossed className="h-8 w-8 text-zinc-600" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                          {uploadandoFotoId === item.id ? (
                            <Loader2 className="h-6 w-6 animate-spin text-white" />
                          ) : (
                            <>
                              <button
                                onClick={() => fotoInputRefs.current[item.id]?.click()}
                                className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/30"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                {item.foto ? 'Trocar' : 'Adicionar'}
                              </button>
                              {item.foto && (
                                <button
                                  onClick={() => handleRemoverFoto(item)}
                                  className="flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-red-500"
                                >
                                  <ImageOff className="h-3.5 w-3.5" />
                                  Remover
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          ref={(el) => { fotoInputRefs.current[item.id] = el }}
                          onChange={(e) => {
                            const arquivo = e.target.files?.[0]
                            if (arquivo) handleUploadFoto(item, arquivo)
                            e.target.value = ''
                          }}
                        />
                      </div>

                      {/* Info */}
                      <div className="p-5">
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
                              disabled={ocupado}
                              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeletar(item)}
                              disabled={ocupado}
                              className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
                          <span className="text-xl font-extrabold">{formatarBRL(Number(item.preco))}</span>
                          <Toggle ativo={item.disponivel} carregando={ocupado} onChange={() => handleToggleDisponivel(item)} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal de item ── */}
      {modalAberto && (
        <ModalForm
          editando={editando}
          categorias={categorias}
          nome={nome}
          descricao={descricao}
          preco={preco}
          disponivel={disponivel}
          categoriaId={categoriaId}
          salvando={salvando}
          onChangeNome={setNome}
          onChangeDescricao={setDescricao}
          onChangePreco={setPreco}
          onChangeDisponivel={setDisponivel}
          onChangeCategoriaId={setCategoriaId}
          onFechar={() => { if (!salvando) setModalAberto(false) }}
          onSalvar={handleSalvar}
        />
      )}

      {/* ── Modal de categoria ── */}
      {modalCategoriaAberto && (
        <ModalCategoria
          editando={editandoCategoria}
          nome={nomeCategoria}
          salvando={salvandoCategoria}
          onChangeNome={setNomeCategoria}
          onFechar={() => { if (!salvandoCategoria) setModalCategoriaAberto(false) }}
          onSalvar={handleSalvarCategoria}
        />
      )}
    </Layout>
  )
}

function Toggle({
  ativo, carregando, onChange,
}: { ativo: boolean; carregando: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={carregando}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${ativo ? 'bg-emerald-500' : 'bg-zinc-700'} disabled:opacity-50`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${ativo ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function ModalForm({
  editando, categorias, nome, descricao, preco, disponivel, categoriaId, salvando,
  onChangeNome, onChangeDescricao, onChangePreco, onChangeDisponivel, onChangeCategoriaId,
  onFechar, onSalvar,
}: {
  editando: ItemCardapio | null
  categorias: Categoria[]
  nome: string
  descricao: string
  preco: string
  disponivel: boolean
  categoriaId: string
  salvando: boolean
  onChangeNome: (v: string) => void
  onChangeDescricao: (v: string) => void
  onChangePreco: (v: string) => void
  onChangeDisponivel: (v: boolean) => void
  onChangeCategoriaId: (v: string) => void
  onFechar: () => void
  onSalvar: (e: FormEvent) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold">{editando ? 'Editar item' : 'Novo item'}</h3>
          <button onClick={onFechar} disabled={salvando} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSalvar}>
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Nome</span>
            <input
              type="text" required minLength={2} maxLength={100} value={nome}
              onChange={(e) => onChangeNome(e.target.value)} placeholder="ex: Galeto Inteiro"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">
              Descrição <span className="text-zinc-500">(opcional)</span>
            </span>
            <textarea
              maxLength={500} value={descricao} onChange={(e) => onChangeDescricao(e.target.value)}
              placeholder="ex: Acompanha arroz, farofa e vinagrete" rows={3}
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Preço (R$)</span>
            <input
              type="number" required min={0} step="0.01" value={preco}
              onChange={(e) => onChangePreco(e.target.value)} placeholder="45.00"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          {categorias.length > 0 && (
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">Categoria</span>
              <select
                value={categoriaId}
                onChange={(e) => onChangeCategoriaId(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-orange-500"
              >
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
          )}

          <label className="mb-6 flex items-center gap-3">
            <Toggle ativo={disponivel} carregando={false} onChange={() => onChangeDisponivel(!disponivel)} />
            <span className="text-sm font-medium text-zinc-300">Disponível para o cliente</span>
          </label>

          <div className="flex gap-2">
            <button
              type="button" onClick={onFechar} disabled={salvando}
              className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={salvando || !nome.trim() || !preco}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : editando ? 'Salvar' : 'Criar item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModalCategoria({
  editando, nome, salvando, onChangeNome, onFechar, onSalvar,
}: {
  editando: Categoria | null
  nome: string
  salvando: boolean
  onChangeNome: (v: string) => void
  onFechar: () => void
  onSalvar: (e: FormEvent) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onFechar}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold">{editando ? 'Renomear categoria' : 'Nova categoria'}</h3>
          <button onClick={onFechar} disabled={salvando} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSalvar}>
          <label className="mb-5 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Nome da categoria</span>
            <input
              type="text" required minLength={1} maxLength={100} value={nome} autoFocus
              onChange={(e) => onChangeNome(e.target.value)} placeholder="ex: Pratos principais"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
            />
          </label>

          <div className="flex gap-2">
            <button type="button" onClick={onFechar} disabled={salvando}
              className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando || !nome.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">
              {salvando ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : editando ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
