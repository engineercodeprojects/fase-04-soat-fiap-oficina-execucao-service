export enum StatusExecucao {
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
 *   ATRIBUIDA -> EM_DIAGNOSTICO -> AGUARDANDO_APROVACAO -> EM_EXECUCAO -> EXECUTADA
 *        \______________\_______________\
 *                                        -> CANCELADA (orcamento reprovado / rollback)
 *
 * ATRIBUIDA -> AGUARDANDO_APROVACAO tambem e permitido (diagnostico fechado sem
 * marcar EM_DIAGNOSTICO explicitamente). EXECUTADA e CANCELADA sao finais.
 */
export const TRANSICOES_PERMITIDAS: Readonly<Record<StatusExecucao, readonly StatusExecucao[]>> = {
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
