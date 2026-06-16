import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChefHat, Mail, Lock, Phone, Store, User, Loader2 } from 'lucide-react'
import { API_URL } from '../lib/api'

export default function Cadastro() {
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const [form, setForm] = useState({
    nomeEstabelecimento: '',
    telefoneEstabelecimento: '',
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
  })

  function atualizar(campo: string, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (form.senha !== form.confirmarSenha) {
      setErro('As senhas não coincidem')
      return
    }

    setCarregando(true)
    try {
      const resposta = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeEstabelecimento: form.nomeEstabelecimento,
          telefoneEstabelecimento: form.telefoneEstabelecimento,
          nome: form.nome,
          email: form.email,
          senha: form.senha,
        }),
      })

      const dados = await resposta.json()

      if (!resposta.ok) {
        setErro(dados.erro ?? 'Erro ao cadastrar')
        return
      }

      navigate('/aguardando-aprovacao')
    } catch {
      setErro('Falha de conexão com o servidor')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 py-10 font-sans">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500">
            <ChefHat className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-100">Comanda IA</h1>
          <p className="mt-1 text-sm text-zinc-400">Cadastre seu estabelecimento</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          {/* Seção estabelecimento */}
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Dados do estabelecimento
          </p>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Nome do estabelecimento</span>
            <div className="relative">
              <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                required
                minLength={2}
                value={form.nomeEstabelecimento}
                onChange={(e) => atualizar('nomeEstabelecimento', e.target.value)}
                placeholder="Ex: Pizzaria do Bairro"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
              />
            </div>
          </label>

          <label className="mb-6 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Telefone / WhatsApp</span>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="tel"
                required
                minLength={8}
                value={form.telefoneEstabelecimento}
                onChange={(e) => atualizar('telefoneEstabelecimento', e.target.value)}
                placeholder="(85) 99999-9999"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
              />
            </div>
          </label>

          {/* Seção responsável */}
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Dados do responsável
          </p>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Seu nome</span>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                required
                minLength={2}
                value={form.nome}
                onChange={(e) => atualizar('nome', e.target.value)}
                placeholder="João Silva"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
              />
            </div>
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => atualizar('email', e.target.value)}
                placeholder="voce@email.com"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-orange-500"
              />
            </div>
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="password"
                required
                minLength={8}
                value={form.senha}
                onChange={(e) => atualizar('senha', e.target.value)}
                placeholder="Mínimo 8 caracteres"
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
                value={form.confirmarSenha}
                onChange={(e) => atualizar('confirmarSenha', e.target.value)}
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
            disabled={carregando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {carregando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Cadastrando...</>
            ) : (
              'Cadastrar estabelecimento'
            )}
          </button>

          <p className="mt-4 text-center text-sm text-zinc-500">
            Já tem conta?{' '}
            <Link to="/login" className="font-medium text-orange-400 hover:text-orange-300">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
