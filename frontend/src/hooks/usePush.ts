import { useEffect, useState } from 'react'
import { API_URL } from '../lib/api'

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const bytes = new Uint8Array([...raw].map((c) => c.charCodeAt(0)))
  return bytes.buffer as ArrayBuffer
}

export function usePush(token: string | null) {
  const [ativo, setAtivo] = useState(false)
  const [suportado, setSuportado] = useState(false)

  useEffect(() => {
    setSuportado('serviceWorker' in navigator && 'PushManager' in window)
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.getRegistration('/sw.js').then((reg) => {
      if (!reg) return
      reg.pushManager.getSubscription().then((sub) => setAtivo(!!sub))
    })
  }, [])

  async function ativar() {
    if (!token) return
    const reg = await navigator.serviceWorker.register('/sw.js')
    const keyResp = await fetch(`${API_URL}/push/vapid-public-key`)
    const { publicKey } = await keyResp.json()

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }

    await fetch(`${API_URL}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
    })

    setAtivo(true)
  }

  async function desativar() {
    if (!token) return
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return

    await fetch(`${API_URL}/push/unsubscribe`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })

    await sub.unsubscribe()
    setAtivo(false)
  }

  return { ativo, suportado, ativar, desativar }
}
