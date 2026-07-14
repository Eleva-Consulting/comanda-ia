import { useEffect, useState } from 'react'
import { useParams }           from 'react-router'
import { API_URL }             from '../lib/api'

interface ItemRodada {
  id:             string
  nomeItem:       string
  quantidade:     number
  observacao:     string | null
  acompanhamento: string | null
}

interface Rodada {
  id:          string
  criadaEm:    string
  mesaNumero:  string | null
  comandaNome: string
  itens:       ItemRodada[]
}

interface Estabelecimento {
  nome: string
}

export default function ImprimirRodada() {
  const { rodadaId }  = useParams<{ rodadaId: string }>()
  const token         = localStorage.getItem('token')
  const [rodada, setRodada] = useState<Rodada | null>(null)
  const [estab, setEstab]   = useState<Estabelecimento | null>(null)
  const [erro, setErro]     = useState<string | null>(null)

  useEffect(() => {
    if (!token || !rodadaId) return
    Promise.all([
      fetch(`${API_URL}/rodadas/${rodadaId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_URL}/meu-estabelecimento`,  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([r, e]) => {
        if (r.erro) { setErro(r.erro); return }
        setRodada(r)
        setEstab(e)
      })
      .catch(() => setErro('Falha ao carregar dados'))
  }, [token, rodadaId])

  useEffect(() => {
    if (!rodada || !estab) return
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [rodada, estab])

  if (erro)             return <div style={{ fontFamily: 'monospace', padding: 16 }}>Erro: {erro}</div>
  if (!rodada || !estab) return <div style={{ fontFamily: 'monospace', padding: 16 }}>Carregando...</div>

  const data = new Date(rodada.criadaEm)
  const dataStr = data.toLocaleDateString('pt-BR')
  const horaStr = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="comanda">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 4mm; }
          body  { margin: 0; }
          .no-print { display: none !important; }
        }
        .comanda {
          font-family: 'Courier New', Courier, monospace;
          font-size: 15px;
          font-weight: bold;
          width: 72mm;
          margin: 0 auto;
          padding: 4mm;
          color: #000;
          background: #fff;
        }
        .linha { border-top: 1px dashed #000; margin: 4px 0; }
        .center { text-align: center; }
        .bold   { font-weight: bold; }
        .row    { display: flex; justify-content: space-between; }
        .item-row { margin-bottom: 2px; }
        .obs    { margin-left: 16px; font-style: italic; }
      `}</style>

      <p className="center bold" style={{ fontSize: 18 }}>{estab.nome}</p>
      <div className="linha" />
      <p className="center bold">
        {rodada.mesaNumero ? `Mesa ${rodada.mesaNumero}` : 'Sem mesa'} · {rodada.comandaNome}
      </p>
      <p className="center">{dataStr} {horaStr}</p>
      <div className="linha" />

      {rodada.itens.map((item) => (
        <div key={item.id} className="item-row">
          <div className="row">
            <span>{item.quantidade}x {item.nomeItem}</span>
          </div>
          {item.acompanhamento && <p className="obs"><strong>Acompanhamento: {item.acompanhamento}</strong></p>}
          {item.observacao && <p className="obs">obs: {item.observacao}</p>}
        </div>
      ))}

      <p className="center no-print" style={{ marginTop: 16, color: '#666' }}>
        A impressão deve iniciar automaticamente.
      </p>
      <button
        onClick={() => window.print()}
        className="no-print"
        style={{ display: 'block', margin: '8px auto', padding: '6px 16px', cursor: 'pointer' }}
      >
        Imprimir novamente
      </button>
    </div>
  )
}
