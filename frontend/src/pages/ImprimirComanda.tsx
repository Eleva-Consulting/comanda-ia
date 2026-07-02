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
  id:              string
  clienteNome:     string
  clienteFone:     string | null
  enderecoEntrega: string | null
  bairroNome:      string | null
  taxaEntrega:     number | null
  tipoEntrega:     'entrega' | 'retirada'
  formaPagamento:  'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'
  precisaTroco:    boolean
  trocoPara:       number | null
  status:          string
  total:           number
  criadoEm:        string
  itens:           ItemPedido[]
}

const formaPagamentoLabel: Record<string, string> = {
  pix:            'PIX',
  dinheiro:       'Dinheiro',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito:  'Cartão de Débito',
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
          font-weight: bold;
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
      {pedido.clienteFone && <p>Fone:    {pedido.clienteFone}</p>}
      <p className="bold">{pedido.tipoEntrega === 'entrega' ? '🛵 ENTREGA' : '🏪 RETIRADA'}</p>
      {pedido.tipoEntrega === 'entrega' && pedido.enderecoEntrega && (
        <>
          {pedido.bairroNome && <p>Bairro: {pedido.bairroNome}</p>}
          <p>Endereço: {pedido.enderecoEntrega}</p>
        </>
      )}
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

      {pedido.tipoEntrega === 'entrega' && !!pedido.taxaEntrega && (
        <div className="row">
          <span>Taxa de entrega</span>
          <span>R${Number(pedido.taxaEntrega).toFixed(2)}</span>
        </div>
      )}
      <div className="linha-dupla" />
      <div className="total-row">
        <span>TOTAL</span>
        <span>R${Number(pedido.total).toFixed(2)}</span>
      </div>
      <div className="linha-dupla" />

      <p>Pagamento: {formaPagamentoLabel[pedido.formaPagamento] ?? pedido.formaPagamento}</p>
      {pedido.formaPagamento === 'dinheiro' && pedido.precisaTroco && pedido.trocoPara != null && (
        <>
          <p>Troco para: R${Number(pedido.trocoPara).toFixed(2)}</p>
          <p>Levar de troco: R${(Number(pedido.trocoPara) - Number(pedido.total)).toFixed(2)}</p>
        </>
      )}

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
