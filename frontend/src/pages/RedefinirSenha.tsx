import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ChefHat, Lock, Loader2 } from 'lucide-react'
import { API_URL } from '../lib/api'

export default function RedefinirSenha() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()

  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem')
      return
    }
    setCarregando(true)
    try {
      const resp = await fetch(`${API_URL}/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha }),
      })
      const dados = await resp.json()
      if (!resp.ok) {
        setErro(dados.erro ?? 'Erro ao redefinir senha')
        return
      }
      navigate('/login', { state: { mensagem: 'Senha redefinida com sucesso! Faça login.' } })
    } catch {
      setErro('Falha de conexão com o servidor')
    } finally {
      setCarregando(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 font-sans text-center">
        <div>
          <p className="text-zinc-400">Link inválido ou incompleto.</p>
          <Link to="/login" className="mt-4 inline-block text-sm text-orange-400 hover:text-orange-300">
            Voltar ao login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500">
            <ChefHat className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-100">Nova senha</h1>
          <p className="mt-1 text-sm text-zinc-400">Escolha uma senha com no mínimo 8 caracteres</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Nova senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                minLength={8}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
              />
            </div>
          </label>

          <label className="mb-6 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Confirmar senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                minLength={8}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="••••••••"
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
            disabled={carregando || !novaSenha || !confirmarSenha}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {carregando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
