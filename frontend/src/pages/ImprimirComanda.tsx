import { useEffect, useState } from 'react'
import { useParams }           from 'react-router'
import { API_URL }             from '../lib/api'

interface ItemPedido {
  id:         string
  nomeItem:   string
  quantidade: number
  precoUnit:  number
  observacao: string | null
}

interface Pedido {
  id:          string
  clienteNome: string
  clienteFone: string
  status:      string
  total:       number
  criadoEm:   string
  itens:       ItemPedido[]
}

interface Estabelecimento {
  nome:     string
  telefone: string
}

export default function ImprimirComanda() {
  const { pedidoId }  = useParams<{ pedidoId: string }>()
  const token         = localStorage.getItem('token')
  const [pedido, setPedido]             = useState<Pedido | null>(null)
  const [estab, setEstab]               = useState<Estabelecimento | null>(null)
  const [erro, setErro]                 = useState<string | null>(null)

  useEffect(() => {
    if (!token || !pedidoId) return
    Promise.all([
      fetch(`${API_URL}/pedidos/${pedidoId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_URL}/meu-estabelecimento`,  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([p, e]) => {
        if (p.erro) { setErro(p.erro); return }
        setPedido(p)
        setEstab(e)
      })
      .catch(() => setErro('Falha ao carregar dados'))
  }, [token, pedidoId])

  useEffect(() => {
    if (!pedido || !estab) return
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [pedido, estab])

  if (erro)            return <div style={{ fontFamily: 'monospace', padding: 16 }}>Erro: {erro}</div>
  if (!pedido || !estab) return <div style={{ fontFamily: 'monospace', padding: 16 }}>Carregando...</div>

  const data = new Date(pedido.criadoEm)
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
          font-size: 12px;
          width: 72mm;
          margin: 0 auto;
          padding: 4mm;
          color: #000;
          background: #fff;
        }
        .linha { border-top: 1px dashed #000; margin: 4px 0; }
        .linha-dupla { border-top: 3px double #000; margin: 4px 0; }
        .center { text-align: center; }
        .bold   { font-weight: bold; }
        .row    { display: flex; justify-content: space-between; }
        .item-row { margin-bottom: 2px; }
        .obs    { margin-left: 16px; font-style: italic; }
        .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; }
      `}</style>

      <p className="center bold" style={{ fontSize: 14 }}>{estab.nome}</p>
      <div className="linha" />
      <p className="center bold">Pedido #{pedido.id.slice(-6).toUpperCase()}</p>
      <p className="center">{dataStr} {horaStr}</p>
      <div className="linha" />
      <p>Cliente: {pedido.clienteNome}</p>
      <p>Fone:    {pedido.clienteFone}</p>
      <div className="linha" />

      {pedido.itens.map((item) => (
        <div key={item.id} className="item-row">
          <div className="row">
            <span>{item.quantidade}x {item.nomeItem}</span>
            <span>R${(Number(item.precoUnit) * item.quantidade).toFixed(2)}</span>
          </div>
          {item.observacao && <p className="obs">obs: {item.observacao}</p>}
        </div>
      ))}

      <div className="linha-dupla" />
      <div className="total-row">
        <span>TOTAL</span>
        <span>R${Number(pedido.total).toFixed(2)}</span>
      </div>
      <div className="linha-dupla" />

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
