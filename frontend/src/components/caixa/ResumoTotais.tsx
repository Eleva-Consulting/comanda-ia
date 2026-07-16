import type { ResumoConta } from './tipos'
import { formatarReais } from './tipos'

// Card de totais da conta. Fica verde quando o saldo zera (tela ④ da spec).
export default function ResumoTotais({ resumo }: { resumo: ResumoConta }) {
  const quitada = resumo.saldoDevedor <= 0

  return (
    <div className={`rounded-2xl border p-4 ${quitada ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900'}`}>
      <div className="flex justify-between text-sm text-zinc-400">
        <span>Total da conta</span><span>{formatarReais(resumo.totalConta)}</span>
      </div>
      {resumo.descontoValor > 0 && (
        <div className="flex justify-between text-sm text-emerald-400">
          <span>Desconto</span><span>- {formatarReais(resumo.descontoValor)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm text-zinc-400">
        <span>Já pago</span><span>{formatarReais(resumo.totalPago)}</span>
      </div>
      <div className={`mt-2 flex justify-between border-t pt-2 text-base font-bold ${quitada ? 'border-emerald-500/30' : 'border-zinc-800'}`}>
        <span>Saldo devedor</span>
        <span className={quitada ? 'text-emerald-400' : ''}>{formatarReais(resumo.saldoDevedor)}</span>
      </div>
      {quitada && <p className="mt-1 text-xs text-emerald-400">Todos os pagamentos registrados ✓</p>}
    </div>
  )
}
