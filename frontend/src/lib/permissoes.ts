import { getRole } from './auth'

export type Permissao = 'cozinha' | 'cardapio' | 'historico' | 'pedido_manual' | 'configuracoes' | 'mesas' | 'caixa'

export const TODAS_PERMISSOES: { id: Permissao; label: string }[] = [
  { id: 'cozinha',       label: 'Cozinha — ver e atualizar pedidos' },
  { id: 'cardapio',      label: 'Cardápio — editar itens e categorias' },
  { id: 'historico',     label: 'Histórico — ver pedidos anteriores' },
  { id: 'pedido_manual', label: 'Criar pedido manualmente' },
  { id: 'configuracoes', label: 'Configurações do estabelecimento' },
  { id: 'mesas',         label: 'Mesas — abrir mesas e lançar pedidos' },
  { id: 'caixa',         label: 'Caixa — fechar contas e processar pagamentos' },
]

export function getPermissoes(): Permissao[] {
  const role = getRole()
  if (role === 'DONO' || role === 'SUPER_ADMIN') {
    return TODAS_PERMISSOES.map((p) => p.id)
  }
  try {
    const token = localStorage.getItem('token')
    if (!token) return []
    const payload = JSON.parse(atob(token.split('.')[1]))
    return (payload.permissoes ?? []) as Permissao[]
  } catch {
    return []
  }
}

export function temPermissao(permissao: Permissao): boolean {
  return getPermissoes().includes(permissao)
}
