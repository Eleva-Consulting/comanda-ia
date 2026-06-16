import { ChefHat, Clock } from 'lucide-react'
import { Link } from 'react-router'

export default function AguardandoAprovacao() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 font-sans">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500">
            <ChefHat className="h-9 w-9 text-white" />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10">
              <Clock className="h-7 w-7 text-orange-400" />
            </div>
          </div>

          <h2 className="mb-2 text-xl font-extrabold text-zinc-100">
            Cadastro recebido!
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-zinc-400">
            Seu estabelecimento foi cadastrado com sucesso e está aguardando aprovação.
            Nossa equipe irá analisar e liberar o acesso em breve.
          </p>

          <div className="mb-6 rounded-xl bg-orange-500/10 px-4 py-3 ring-1 ring-orange-500/20">
            <p className="text-sm font-medium text-orange-300">
              Você receberá acesso assim que a plataforma aprovar seu cadastro.
            </p>
          </div>

          <Link
            to="/login"
            className="block w-full rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
          >
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  )
}
