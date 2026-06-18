import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  ChefHat,
  Check,
  Star,
  Zap,
  BarChart3,
  Smartphone,
  Menu,
  X,
  ArrowRight,
  Clock,
  Bell,
  TrendingUp,
} from 'lucide-react'

// --- Animate on scroll hook ---
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return { ref, visible }
}

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const { ref, visible } = useReveal()
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// --- Mock Visuals ---

function KitchenPanelMock() {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 shadow-2xl w-full max-w-sm mx-auto">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold text-zinc-300 tracking-wide uppercase">Painel da Cozinha</span>
        </div>
        <span className="text-xs text-zinc-500 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          ao vivo
        </span>
      </div>

      {/* Order card 1 */}
      <div className="bg-zinc-800 rounded-xl p-3 mb-2 border border-orange-500/30">
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-orange-400 uppercase">Novo</span>
            <p className="text-sm font-semibold text-white mt-0.5">#042 · Mesa 7</p>
          </div>
          <span className="text-[10px] text-zinc-400 flex items-center gap-1">
            <Clock className="h-3 w-3" /> agora
          </span>
        </div>
        <div className="space-y-1 mb-3">
          <p className="text-xs text-zinc-300">2x X-Burguer Clássico</p>
          <p className="text-xs text-zinc-300">1x Batata Frita Grande</p>
          <p className="text-xs text-zinc-300">2x Refrigerante Lata</p>
        </div>
        <button className="w-full bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors">
          Iniciar preparo
        </button>
      </div>

      {/* Order card 2 */}
      <div className="bg-zinc-800 rounded-xl p-3 mb-2 border border-yellow-500/20">
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-yellow-400 uppercase">Em preparo</span>
            <p className="text-sm font-semibold text-white mt-0.5">#041 · Balcão</p>
          </div>
          <span className="text-[10px] text-zinc-400 flex items-center gap-1">
            <Clock className="h-3 w-3" /> 8 min
          </span>
        </div>
        <div className="space-y-1 mb-3">
          <p className="text-xs text-zinc-300">1x Pizza Margherita G</p>
          <p className="text-xs text-zinc-300">1x Suco de Laranja</p>
        </div>
        <button className="w-full bg-zinc-700 text-zinc-200 text-xs font-semibold py-1.5 rounded-lg">
          Marcar como pronto
        </button>
      </div>

      {/* Order card 3 — compact */}
      <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-blue-400 uppercase">Pronto</span>
            <p className="text-sm font-semibold text-zinc-400 mt-0.5">#040 · Delivery</p>
          </div>
          <span className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Clock className="h-3 w-3" /> 14 min
          </span>
        </div>
      </div>
    </div>
  )
}

function MenuMock() {
  const items = [
    { name: 'X-Burguer Clássico', price: 'R$ 28,90' },
    { name: 'Batata Frita Grande', price: 'R$ 16,90' },
    { name: 'X-Bacon Duplo', price: 'R$ 38,90' },
  ]
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 shadow-2xl w-full max-w-xs mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ChefHat className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-bold text-white">Hamburguer do João</span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-4">Abra e monte seu pedido</p>

      <div className="text-[10px] font-bold tracking-widest text-orange-400 uppercase mb-2">🍔 Hamburgueres</div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2">
            <div>
              <p className="text-xs font-medium text-white">{item.name}</p>
              <p className="text-[11px] text-orange-400 font-semibold">{item.price}</p>
            </div>
            <button className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold leading-none hover:bg-orange-400 transition-colors flex-shrink-0">
              +
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-orange-500 rounded-xl py-2.5 text-center text-xs font-bold text-white">
        Ver carrinho (3 itens)
      </div>
    </div>
  )
}

function OrdersMock() {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 shadow-2xl w-full max-w-xs mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-bold text-white">Resumo de hoje</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-zinc-800 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-orange-400">47</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Pedidos</p>
        </div>
        <div className="bg-zinc-800 rounded-xl p-3 text-center col-span-2">
          <p className="text-xl font-bold text-orange-400">R$ 2.340</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Faturamento</p>
        </div>
      </div>

      <div className="bg-zinc-800 rounded-xl p-3 flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-400">Ticket médio</span>
        <span className="text-sm font-bold text-orange-400">R$ 49,80</span>
      </div>
      <div className="bg-zinc-800 rounded-xl p-3 flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-400">Pico de pedidos</span>
        <span className="text-sm font-bold text-white">19h – 21h</span>
      </div>
      <div className="bg-zinc-800 rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-green-400" />
          <span className="text-xs text-zinc-400">vs ontem</span>
        </div>
        <span className="text-sm font-bold text-green-400">+12%</span>
      </div>
    </div>
  )
}

// --- Feature list item ---
function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-zinc-300">
      <Check className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
      {text}
    </li>
  )
}

// --- Star rating ---
function Stars() {
  return (
    <div className="flex gap-0.5 mb-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-orange-400 text-orange-400" />
      ))}
    </div>
  )
}

// --- Avatar ---
function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${color}`}
    >
      {initials}
    </div>
  )
}

// --- Main component ---
export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="bg-zinc-950 text-white min-h-dvh">
      {/* ======= NAVBAR ======= */}
      <nav className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <ChefHat className="h-6 w-6 text-orange-500" />
              <span className="text-lg font-bold text-white tracking-tight">Comanda IA</span>
            </div>

            {/* Desktop nav */}
            <div className="hidden sm:flex items-center gap-3">
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium text-zinc-300 border border-zinc-700 rounded-lg hover:border-zinc-500 hover:text-white transition-colors"
              >
                Entrar
              </Link>
              <Link
                to="/cadastro"
                className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-400 rounded-lg transition-colors flex items-center gap-1.5"
              >
                Começar grátis <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* Mobile menu toggle */}
            <button
              className="sm:hidden p-2 text-zinc-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {/* Mobile nav */}
          {mobileMenuOpen && (
            <div className="sm:hidden pb-4 flex flex-col gap-2">
              <Link
                to="/login"
                className="px-4 py-2.5 text-sm font-medium text-zinc-300 border border-zinc-700 rounded-lg text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                Entrar
              </Link>
              <Link
                to="/cadastro"
                className="px-4 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-lg text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                Começar grátis →
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* ======= HERO ======= */}
      <section className="py-20 sm:py-28 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-12 lg:gap-16 items-center">
          {/* Text */}
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-3 py-1 mb-6">
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-xs font-medium text-orange-400">Setup em minutos · Sem app para instalar</span>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold leading-[1.12] tracking-tight text-white mb-6">
                Transforme o WhatsApp no sistema de pedidos do seu restaurante
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="text-lg text-zinc-400 leading-relaxed mb-3">
                Comanda IA é o sistema que transforma qualquer celular do cliente em um cardápio digital — sem app, sem fila, sem pedido errado.
              </p>
              <p className="text-sm text-zinc-500 leading-relaxed mb-8">
                O cliente recebe um link, monta o pedido no celular e você vê na cozinha em tempo real. Setup em minutos.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/cadastro"
                  className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-semibold text-base px-6 py-3.5 rounded-xl transition-colors"
                >
                  Criar minha conta grátis <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#como-funciona"
                  className="inline-flex items-center justify-center gap-2 text-zinc-300 border border-zinc-700 hover:border-zinc-500 hover:text-white font-medium text-base px-6 py-3.5 rounded-xl transition-colors"
                >
                  Ver como funciona ↓
                </a>
              </div>
            </Reveal>
          </div>

          {/* Visual */}
          <Reveal delay={320} className="flex justify-center">
            <KitchenPanelMock />
          </Reveal>
        </div>
      </section>

      {/* ======= SOCIAL PROOF BAR ======= */}
      <section className="bg-zinc-900 border-y border-zinc-800 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center">
          <Reveal>
            <p className="text-sm text-zinc-400 mb-5">
              Centenas de restaurantes já automatizaram seus pedidos com Comanda IA
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="flex gap-3 overflow-x-auto pb-1 justify-start sm:justify-center scrollbar-none">
              {['🍔 Hamburguerias', '🍕 Pizzarias', '🍗 Galeterias', '🥗 Marmiteiras', '🌮 Food Trucks'].map(
                (label) => (
                  <span
                    key={label}
                    className="flex-shrink-0 bg-zinc-800 text-zinc-300 text-xs font-medium px-4 py-2 rounded-full border border-zinc-700"
                  >
                    {label}
                  </span>
                )
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ======= BENEFITS ======= */}
      <section id="como-funciona" className="py-20 sm:py-28 mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section label */}
        <Reveal className="text-center mb-16">
          <span className="text-xs font-bold tracking-widest text-orange-500 uppercase">Como funciona</span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3 leading-tight">
            Cada parte do seu negócio, resolvida
          </h2>
        </Reveal>

        {/* Pillar 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-24 lg:mb-32">
          <Reveal className="flex justify-center order-2 lg:order-1">
            <MenuMock />
          </Reveal>
          <Reveal delay={120} className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 mb-4">
              <Smartphone className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-bold tracking-widest text-orange-500 uppercase">Para o cliente</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-4 leading-tight">
              Cardápio digital no celular, sem app nenhum
            </h3>
            <p className="text-zinc-400 text-base leading-relaxed mb-6">
              Esqueça anotações erradas e mensagens no WhatsApp. Crie seu cardápio com fotos, categorias e preços. O
              cliente abre o link, escolhe os itens e confirma — tudo no próprio celular.
            </p>
            <ul className="space-y-3 mb-8">
              <FeatureItem text="Cardápio com fotos e categorias" />
              <FeatureItem text="Link único para compartilhar no WhatsApp" />
              <FeatureItem text="Zero instalação para o cliente" />
              <FeatureItem text="Disponível 24h, no celular de qualquer pessoa" />
            </ul>
            <Link
              to="/cadastro"
              className="inline-flex items-center gap-2 text-orange-400 font-semibold text-sm hover:text-orange-300 transition-colors"
            >
              Criar meu cardápio <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        {/* Pillar 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-24 lg:mb-32">
          <Reveal delay={80}>
            <div className="inline-flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-bold tracking-widest text-orange-500 uppercase">Para a cozinha</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-4 leading-tight">
              Pedidos chegam na tela em segundos, na ordem certa
            </h3>
            <p className="text-zinc-400 text-base leading-relaxed mb-6">
              Assim que o cliente confirma, o pedido aparece automaticamente no painel da cozinha. Sem papel, sem
              telefone, sem ruído. Sua equipe sabe exatamente o que preparar e quando.
            </p>
            <ul className="space-y-3 mb-8">
              <FeatureItem text="Painel da cozinha em tempo real" />
              <FeatureItem text="Status por pedido: em preparo → pronto → a caminho" />
              <FeatureItem text="Notificação sonora a cada novo pedido" />
              <FeatureItem text="Funciona em qualquer tablet ou computador" />
            </ul>
            <Link
              to="/cadastro"
              className="inline-flex items-center gap-2 text-orange-400 font-semibold text-sm hover:text-orange-300 transition-colors"
            >
              Ver o painel <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <Reveal delay={200} className="flex justify-center">
            {/* Kitchen dashboard mock - smaller version */}
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 shadow-2xl w-full max-w-xs mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="h-4 w-4 text-orange-500" />
                <span className="text-xs font-semibold text-zinc-300 tracking-wide uppercase">Fila de pedidos</span>
                <span className="ml-auto w-5 h-5 bg-orange-500 rounded-full text-[10px] font-bold flex items-center justify-center">3</span>
              </div>
              {[
                { num: '#042', label: 'Novo', color: 'text-orange-400', bg: 'border-orange-500/30', items: '3 itens · Mesa 7' },
                { num: '#041', label: 'Em preparo', color: 'text-yellow-400', bg: 'border-yellow-500/20', items: '2 itens · Balcão' },
                { num: '#040', label: 'Pronto', color: 'text-blue-400', bg: 'border-blue-500/20', items: '4 itens · Delivery' },
              ].map((o) => (
                <div key={o.num} className={`bg-zinc-800 rounded-xl p-3 mb-2 border ${o.bg}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{o.num}</p>
                    <span className={`text-[10px] font-bold tracking-widest uppercase ${o.color}`}>{o.label}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{o.items}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* Pillar 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <Reveal className="flex justify-center order-2 lg:order-1">
            <OrdersMock />
          </Reveal>
          <Reveal delay={120} className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-bold tracking-widest text-orange-500 uppercase">Para o dono</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-4 leading-tight">
              Histórico, equipe e configurações em um só lugar
            </h3>
            <p className="text-zinc-400 text-base leading-relaxed mb-6">
              Acompanhe pedidos por período, veja faturamento, cadastre operadores para a equipe e configure tudo sem
              depender de ninguém. Você no controle.
            </p>
            <ul className="space-y-3 mb-8">
              <FeatureItem text="Histórico de pedidos com filtro por data" />
              <FeatureItem text="Faturamento e ticket médio por período" />
              <FeatureItem text="Cadastro de operadores para a equipe" />
              <FeatureItem text="Pausa a cozinha com um clique quando precisar" />
            </ul>
            <Link
              to="/cadastro"
              className="inline-flex items-center gap-2 text-orange-400 font-semibold text-sm hover:text-orange-300 transition-colors"
            >
              Começar agora <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ======= TESTIMONIALS ======= */}
      <section className="py-20 sm:py-28 bg-zinc-900/40 border-y border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal className="text-center mb-14">
            <span className="text-xs font-bold tracking-widest text-orange-500 uppercase">Depoimentos</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-3">
              O que os donos estão dizendo
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote:
                  'Antes eu ficava respondendo WhatsApp o dia todo. Agora o cliente monta o pedido sozinho e a cozinha já recebe. Os erros de pedido zeraram e minha equipe ficou muito mais tranquila.',
                name: 'João Mendes',
                role: 'Proprietário · Hamburgueria do João',
                initials: 'JM',
                color: 'bg-orange-500',
              },
              {
                quote:
                  'Conseguimos aumentar o volume de pedidos sem contratar ninguém. O sistema organiza tudo automaticamente. Em menos de uma semana já estava funcionando.',
                name: 'Ana Paula Costa',
                role: 'Gerente · Pizzaria Bella Napoli',
                initials: 'AC',
                color: 'bg-rose-500',
              },
              {
                quote:
                  'É simples demais. Qualquer funcionário aprende em 5 minutos. Os pedidos chegam certinhos na tela, a gente só vai fazendo.',
                name: 'Carlos Silva',
                role: 'Atendente · Galeria Grill & Rotisserie',
                initials: 'CS',
                color: 'bg-amber-500',
              },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 h-full flex flex-col">
                  <Stars />
                  <blockquote className="text-zinc-300 text-sm leading-relaxed flex-1 mb-6">
                    "{t.quote}"
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <Avatar initials={t.initials} color={t.color} />
                    <div>
                      <p className="text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-zinc-500">{t.role}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ======= FINAL CTA ======= */}
      <section className="bg-orange-500 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center">
          <Reveal>
            <p className="text-orange-100 text-sm font-semibold uppercase tracking-widest mb-4">
              Não perca tempo
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-tight">
              Enquanto você lê isso, seu<br className="hidden sm:block" /> concorrente já está automatizando
            </h2>
            <p className="text-orange-100 text-lg mb-10">
              Comece gratuitamente hoje. Configure seu cardápio em minutos.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
              <Link
                to="/cadastro"
                className="inline-flex items-center justify-center gap-2 bg-white text-orange-500 font-bold text-base px-8 py-4 rounded-xl hover:bg-orange-50 transition-colors"
              >
                Criar minha conta grátis <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 border-2 border-white/60 text-white font-semibold text-base px-8 py-4 rounded-xl hover:border-white hover:bg-white/10 transition-colors"
              >
                Já tenho conta — Entrar
              </Link>
            </div>
            <p className="text-orange-200/70 text-xs">
              * Sem cartão de crédito. Sem compromisso. Cancele quando quiser.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ======= FOOTER ======= */}
      <footer className="bg-zinc-950 border-t border-zinc-800 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-orange-500" />
              <span className="text-base font-bold text-white">Comanda IA</span>
              <span className="text-zinc-600 text-sm ml-2">© 2026 · Todos os direitos reservados</span>
            </div>
            <div className="flex gap-5 text-xs text-zinc-500">
              <a href="#" className="hover:text-zinc-300 transition-colors">Política de Privacidade</a>
              <a href="#" className="hover:text-zinc-300 transition-colors">Termos de Uso</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
