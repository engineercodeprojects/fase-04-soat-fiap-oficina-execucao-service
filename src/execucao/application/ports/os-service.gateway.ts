import { StatusExecucao } from '../../domain/status-execucao';

export const OS_SERVICE_GATEWAY = Symbol('OS_SERVICE_GATEWAY');

/**
 * Porta para o OS Service (dono da OS e do status "oficial"). A Execucao
 * propaga para ele a atribuicao de mecanico e as mudancas de status. O
 * adapter HTTP e configuravel (paths, metodo, mapa de status) — ver README.
 */
export interface OsServiceGateway {
  atribuirMecanico(osId: string, mecanicoId: string): Promise<void>;
  atualizarStatus(osId: string, status: StatusExecucao): Promise<void>;
}

/** OS Service fora do ar/timeout/5xx (apos retries) — a operacao local e desfeita. */
export class OsServiceIndisponivelError extends Error {
  constructor(
    mensagem: string,
    readonly causa?: unknown,
  ) {
    super(mensagem);
    this.name = 'OsServiceIndisponivelError';
  }
}
