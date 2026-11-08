import { ItemDiagnostico } from '../../domain/execucao.entity';

export const OS_SERVICE_GATEWAY = Symbol('OS_SERVICE_GATEWAY');

export interface DiagnosticoConcluido {
  numeroOS: string;
  mecanicoId: string;
  diagnostico: string;
  itens: ItemDiagnostico[];
}

/**
 * Callbacks para o OS Service (orquestrador da saga, RFC-0008):
 * `POST /ordens-servico/{numeroOS}/eventos` com envelope `{ id, type, version,
 * occurredAt, producer, data }` — ver docs/contratos/http-interno.md no os-service.
 */
export interface OsServiceGateway {
  /** `execucao.diagnostico-concluido` — OS gera o orcamento e vai para AGUARDANDO_APROVACAO. */
  diagnosticoConcluido(evento: DiagnosticoConcluido): Promise<void>;
  /** `execucao.finalizada` — OS vai para AGUARDANDO_PAGAMENTO e cobra. */
  execucaoFinalizada(evento: { numeroOS: string; finalizadaEm: string }): Promise<void>;
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
