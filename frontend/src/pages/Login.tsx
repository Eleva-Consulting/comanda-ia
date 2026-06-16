import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChefHat, Mail, Lock, Loader2 } from 'lucide-react'
import { API_URL } from '../lib/api'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)

    try {
      const resposta = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      })

      const dados = await resposta.json()

      if (!resposta.ok) {
        setErro(dados.erro ?? 'Erro ao entrar')
        return
      }

      localStorage.setItem('token', dados.token)

      if (dados.usuario.role === 'SUPER_ADMIN') {
        navigate('/admin')
      } else {
        navigate('/dashboard')
      }
    } catch (e) {
      console.error('Erro no login:', e)
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
          <h1 className="text-2xl font-extrabold text-zinc-100">Comanda IA</h1>
          <p className="mt-1 text-sm text-zinc-400">Entre na sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <label className="mb-4 block">
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

          <label className="mb-6 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
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
            disabled={carregando || !email || !senha}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {carregando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Entrando...</>
            ) : 'Entrar'}
          </button>

          <p className="mt-4 text-center text-sm text-zinc-500">
            Não tem conta?{' '}
            <Link to="/cadastro" className="font-medium text-orange-400 hover:text-orange-300">
              Cadastrar estabelecimento
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
