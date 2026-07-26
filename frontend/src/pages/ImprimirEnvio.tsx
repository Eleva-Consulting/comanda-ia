import { useEffect, useState } from 'react'
import { useParams }           from 'react-router'
import { API_URL }             from '../lib/api'

interface ItemEnvio {
  id:             string
  nomeItem:       string
  quantidade:     number
  observacao:     string | null
  acompanhamento: string | null
}

interface ComandaEnvio {
  nome:  string
  itens: ItemEnvio[]
}

interface Envio {
  envioId:       string
  criadaEm:      string
  mesaNumero:    string | null
  numeroPessoas: number | null
  abertaPorNome: string | null
  comandas:      ComandaEnvio[]
}

interface Estabelecimento {
  nome: string
}

// Ticket único pra todas as comandas enviadas juntas no mesmo clique de "Confirmar e
// enviar tudo pra cozinha" — equivalente a ImprimirRodada.tsx, mas agrupando várias
// comandas (uma rodada por comanda, mesmo envioId) numa impressão só.
export default function ImprimirEnvio() {
  const { envioId }  = useParams<{ envioId: string }>()
  const token         = localStorage.getItem('token')
  const [envio, setEnvio]   = useState<Envio | null>(null)
  const [estab, setEstab]   = useState<Estabelecimento | null>(null)
  const [erro, setErro]     = useState<string | null>(null)

  useEffect(() => {
    if (!token || !envioId) return
    Promise.all([
      fetch(`${API_URL}/rodadas/envio/${envioId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_URL}/meu-estabelecimento`,      { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([e, es]) => {
        if (e.erro) { setErro(e.erro); return }
        setEnvio(e)
        setEstab(es)
      })
      .catch(() => setErro('Falha ao carregar dados'))
  }, [token, envioId])

  useEffect(() => {
    if (!envio || !estab) return
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [envio, estab])

  if (erro)             return <div style={{ fontFamily: 'monospace', padding: 16 }}>Erro: {erro}</div>
  if (!envio || !estab) return <div style={{ fontFamily: 'monospace', padding: 16 }}>Carregando...</div>

  const data = new Date(envio.criadaEm)
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
        .comanda-nome { margin-top: 6px; text-decoration: underline; }
      `}</style>

      <p className="center bold" style={{ fontSize: 18 }}>{estab.nome}</p>
      <div className="linha" />
      <p className="center bold">
        {envio.mesaNumero ? `Mesa ${envio.mesaNumero}` : 'Sem mesa'}
      </p>
      <p className="center">{dataStr} {horaStr}</p>
      {envio.numeroPessoas && <p className="center">Pessoas na mesa: {envio.numeroPessoas}</p>}
      {envio.abertaPorNome && <p className="center">Aberta por: {envio.abertaPorNome}</p>}
      <div className="linha" />

      {envio.comandas.map((comanda, idx) => (
        <div key={idx}>
          <p className="comanda-nome">{comanda.nome}</p>
          {comanda.itens.map((item) => (
            <div key={item.id} className="item-row">
              <div className="row">
                <span>{item.quantidade}x {item.nomeItem}</span>
              </div>
              {item.acompanhamento && <p className="obs"><strong>Acompanhamento: {item.acompanhamento}</strong></p>}
              {item.observacao && <p className="obs">obs: {item.observacao}</p>}
            </div>
          ))}
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
