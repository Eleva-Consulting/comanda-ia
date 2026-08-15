export const TIPO_ERRO_IMPRESSAO = 'comanda-ia:erro-impressao'

// As páginas /imprimir/* rodam dentro de um iframe invisível fora da tela (ver
// Cozinha.tsx/CardPedidoKanban.tsx) — se o fetch de dados falhar, a mensagem de erro
// é renderizada dentro desse iframe e nunca chega a ser vista pelo operador. Isso avisa
// a janela principal (Layout.tsx escuta via 'message') pra mostrar o erro de verdade.
export function notificarErroImpressao(mensagem: string) {
  if (window.parent === window) return
  window.parent.postMessage({ tipo: TIPO_ERRO_IMPRESSAO, mensagem }, window.location.origin)
}
