export interface DivisaoCancelamento {
  restante: number;
  dividir:  boolean;
}

// Decide se cancelar `quantidadeCancelar` unidades de um ItemComanda com
// `quantidadeAtual` unidades cancela o item inteiro ou exige dividir em dois
// registros (o original com a quantidade restante ativa + um novo item cancelado
// com a quantidade removida).
export function calcularDivisaoCancelamento(quantidadeAtual: number, quantidadeCancelar: number): DivisaoCancelamento {
  if (!Number.isInteger(quantidadeCancelar) || quantidadeCancelar < 1) {
    throw new Error('Quantidade a cancelar deve ser um número inteiro maior que zero');
  }
  if (quantidadeCancelar > quantidadeAtual) {
    throw new Error('Quantidade a cancelar não pode ser maior que a quantidade do item');
  }
  const restante = quantidadeAtual - quantidadeCancelar;
  return { restante, dividir: restante > 0 };
}
