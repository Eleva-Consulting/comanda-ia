import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { ChefHat, Mail, Loader2, ArrowLeft } from 'lucide-react'
import { API_URL } from '../lib/api'

export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      const resp = await fetch(`${API_URL}/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!resp.ok) {
        const dados = await resp.json()
        setErro(dados.erro ?? 'Erro ao processar solicitação')
        return
      }
      setEnviado(true)
    } catch {
      setErro('Falha de conexão com o servidor')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500">
            <ChefHat className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-100">Recuperar senha</h1>
          <p className="mt-1 text-center text-sm text-zinc-400">
            {enviado ? 'Verifique seu email' : 'Informe seu email para receber as instruções'}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          {enviado ? (
            <div className="text-center">
              <p className="mb-6 text-sm text-zinc-300">
                Se <strong className="text-zinc-100">{email}</strong> estiver cadastrado,
                você receberá um link para redefinir sua senha em instantes.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-orange-400 hover:text-orange-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="mb-6 block">
                <span className="mb-2 block text-sm font-medium text-zinc-300">Email</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
                  />
                </div>
              </label>

              {erro && (
                <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/30">
                  {erro}
                </p>
              )}

              <button
                type="submit"
                disabled={carregando || !email}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {carregando ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                ) : 'Enviar instruções'}
              </button>

              <p className="mt-4 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
