interface ConfigEvolution {
  url:   string
  token: string
}

export async function enviarMensagemWhatsApp(
  config: ConfigEvolution,
  numero: string,
  texto: string,
): Promise<void> {
  const telefone = numero.replace(/\D/g, '')
  const fone = telefone.startsWith('55') ? telefone : `55${telefone}`

  const resp = await fetch(`${config.url}/message/sendText/comanda-ia`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.token,
    },
    body: JSON.stringify({
      number: fone,
      text:   texto,
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Evolution API error ${resp.status}: ${body}`)
  }
}
