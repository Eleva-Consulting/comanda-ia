import { Link } from 'react-router'
import { ChefHat, MessageCircle, ArrowRight } from 'lucide-react'

const WHATSAPP_URL =
  'https://wa.me/5516992301119?text=Ol%C3%A1!%20Gostaria%20de%20testar%20o%20Comanda%20IA%20no%20meu%20restaurante.'

export default function Cadastro() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 py-10 font-sans">
      <div className="w-full max-w-md text-center">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/20">
            <ChefHat className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-100">Comanda IA</h1>
          <p className="mt-1 text-sm text-zinc-400">Liberação de acesso para restaurantes</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
          <div className="mb-6 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <MessageCircle className="h-7 w-7" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-zinc-100 mb-2">
            Atendimento personalizado
          </h2>

          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            Para garantir uma configuração sob medida para o seu cardápio e operação, nosso cadastro é realizado diretamente com nossa equipe via WhatsApp.
          </p>

          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 font-semibold text-white transition hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
          >
            <MessageCircle className="h-5 w-5" />
            Falar conosco no WhatsApp
            <ArrowRight className="h-4 w-4" />
          </a>

          <div className="mt-6 border-t border-zinc-800 pt-6">
            <p className="text-sm text-zinc-500">
              Já possui uma conta?{' '}
              <Link to="/login" className="font-medium text-orange-400 hover:text-orange-300">
                Fazer login
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-6 text-xs text-zinc-600">
          <Link to="/" className="hover:text-zinc-400 transition-colors">
            ← Voltar para a página inicial
          </Link>
        </p>
      </div>
    </div>
  )
}
