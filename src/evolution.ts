interface ConfigEvolution {
  url:          string
  token:        string
  instancia:    string  // nome da instância no Evolution API (ex: slug do estabelecimento)
}

export async function enviarMensagemWhatsApp(
  config: ConfigEvolution,
  numero: string,
  texto: string,
): Promise<void> {
  const telefone = numero.replace(/\D/g, '')
  const fone = telefone.startsWith('55') ? telefone : `55${telefone}`

  const resp = await fetch(`${config.url}/message/sendText/${config.instancia}`, {
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

export async function criarInstancia(
  config: Omit<ConfigEvolution, 'instancia'>,
  instancia: string,
): Promise<void> {
  const resp = await fetch(`${config.url}/instance/create`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.token,
    },
    body: JSON.stringify({
      instanceName: instancia,
      qrcode:       true,
      integration:  'WHATSAPP-BAILEYS',
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Evolution API create instance error ${resp.status}: ${body}`)
  }
}
