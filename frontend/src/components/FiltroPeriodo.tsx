import { useState } from 'react'
import { Calendar } from 'lucide-react'

type Preset = 'hoje' | '7dias' | '30dias' | 'mes' | 'personalizado'

function formatarDataLocal(data: Date): string {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function calcularIntervalo(preset: Exclude<Preset, 'personalizado'>): { inicio: string; fim: string } {
  const hoje = new Date()
  const fim = formatarDataLocal(hoje)

  if (preset === 'hoje') return { inicio: fim, fim }

  if (preset === '7dias') {
    const inicio = new Date(hoje)
    inicio.setDate(inicio.getDate() - 6)
    return { inicio: formatarDataLocal(inicio), fim }
  }

  if (preset === '30dias') {
    const inicio = new Date(hoje)
    inicio.setDate(inicio.getDate() - 29)
    return { inicio: formatarDataLocal(inicio), fim }
  }

  // 'mes' — do dia 1 do mês atual até hoje
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return { inicio: formatarDataLocal(inicio), fim }
}

const presetLabel: Record<Exclude<Preset, 'personalizado'>, string> = {
  hoje:    'Hoje',
  '7dias': '7 dias',
  '30dias': '30 dias',
  mes:     'Este mês',
}

export default function FiltroPeriodo({ onMudarPeriodo }: { onMudarPeriodo: (inicio: string, fim: string) => void }) {
  const [presetAtivo, setPresetAtivo] = useState<Preset>('hoje')
  const [dataInicioCustom, setDataInicioCustom] = useState('')
  const [dataFimCustom, setDataFimCustom] = useState('')

  function selecionarPreset(preset: Exclude<Preset, 'personalizado'>) {
    setPresetAtivo(preset)
    const { inicio, fim } = calcularIntervalo(preset)
    onMudarPeriodo(inicio, fim)
  }

  function aplicarPersonalizado() {
    if (!dataInicioCustom || !dataFimCustom) return
    setPresetAtivo('personalizado')
    onMudarPeriodo(dataInicioCustom, dataFimCustom)
  }

  const botaoClasse = (ativo: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      ativo ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
    }`

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-1.5 text-zinc-500">
        <Calendar className="h-4 w-4" />
      </div>
      {(['hoje', '7dias', '30dias', 'mes'] as const).map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => selecionarPreset(preset)}
          className={botaoClasse(presetAtivo === preset)}
        >
          {presetLabel[preset]}
        </button>
      ))}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">De</span>
        <input
          type="date"
          value={dataInicioCustom}
          onChange={(e) => setDataInicioCustom(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">Até</span>
        <input
          type="date"
          value={dataFimCustom}
          onChange={(e) => setDataFimCustom(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm"
        />
      </label>
      <button type="button" onClick={aplicarPersonalizado} className={botaoClasse(presetAtivo === 'personalizado')}>
        Aplicar
      </button>
    </div>
  )
}
