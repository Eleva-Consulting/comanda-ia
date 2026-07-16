interface Props {
  conectado: boolean
  erro:      string | null
  aceitando: boolean
  disabled:  boolean
  onToggle:  () => void
}

/** Estado da conexão + toggle de aceitar pedidos num único controle (evita repetir o mesmo status em dois lugares). */
export default function ControleAceitandoPedidos({ conectado, erro, aceitando, disabled, onToggle }: Props) {
  if (erro) {
    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        title={erro}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
        <span className="hidden sm:inline">{erro}</span>
      </button>
    )
  }
  if (!aceitando) {
    return (
      <button
        onClick={onToggle}
        disabled={disabled}
        title="Toque para reabrir e voltar a receber pedidos"
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-orange-400 transition hover:bg-orange-500/10 disabled:opacity-50"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
        <span className="hidden sm:inline">Pausada</span>
      </button>
    )
  }
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title="Toque para pausar o recebimento de pedidos"
      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {conectado && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
      </span>
      <span className="hidden sm:inline">{conectado ? 'Ativa' : 'Conectando...'}</span>
    </button>
  )
}
