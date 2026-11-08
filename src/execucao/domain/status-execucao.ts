export enum StatusExecucao {
  NA_FILA = 'NA_FILA',
  ATRIBUIDA = 'ATRIBUIDA',
  EM_DIAGNOSTICO = 'EM_DIAGNOSTICO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  EM_EXECUCAO = 'EM_EXECUCAO',
  EXECUTADA = 'EXECUTADA',
  CANCELADA = 'CANCELADA',
}

/**
 * Maquina de estados da execucao:
 *
 *   NA_FILA -> ATRIBUIDA -> EM_DIAGNOSTICO -> AGUARDANDO_APROVACAO -> EM_EXECUCAO -> EXECUTADA
 *      \___________\____________\_________________\
 *                                                  -> CANCELADA (DELETE do OS Service: OS
 *                                                     cancelada / orcamento reprovado)
 *
 * NA_FILA: enfileirada pelo OS Service, sem mecanico. ATRIBUIDA -> AGUARDANDO_APROVACAO
 * tambem e permitido. EXECUTADA e CANCELADA sao finais.
 */
export const TRANSICOES_PERMITIDAS: Readonly<Record<StatusExecucao, readonly StatusExecucao[]>> = {
  [StatusExecucao.NA_FILA]: [StatusExecucao.ATRIBUIDA, StatusExecucao.CANCELADA],
  [StatusExecucao.ATRIBUIDA]: [
    StatusExecucao.EM_DIAGNOSTICO,
    StatusExecucao.AGUARDANDO_APROVACAO,
    StatusExecucao.CANCELADA,
  ],
  [StatusExecucao.EM_DIAGNOSTICO]: [StatusExecucao.AGUARDANDO_APROVACAO, StatusExecucao.CANCELADA],
  [StatusExecucao.AGUARDANDO_APROVACAO]: [StatusExecucao.EM_EXECUCAO, StatusExecucao.CANCELADA],
  [StatusExecucao.EM_EXECUCAO]: [StatusExecucao.EXECUTADA],
  [StatusExecucao.EXECUTADA]: [],
  [StatusExecucao.CANCELADA]: [],
};

export function podeTransitar(de: StatusExecucao, para: StatusExecucao): boolean {
  return TRANSICOES_PERMITIDAS[de].includes(para);
}

/** Fase em que servicos e pecas ainda podem ser editados (antes da baixa no estoque). */
export function emDiagnostico(status: StatusExecucao): boolean {
  return status === StatusExecucao.ATRIBUIDA || status === StatusExecucao.EM_DIAGNOSTICO;
}

/** Status em que a OS ainda ocupa o veiculo na oficina. */
export function emAndamento(status: StatusExecucao): boolean {
  return status !== StatusExecucao.EXECUTADA && status !== StatusExecucao.CANCELADA;
}
