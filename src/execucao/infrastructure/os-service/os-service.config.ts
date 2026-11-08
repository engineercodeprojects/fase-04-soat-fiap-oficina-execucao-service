import { StatusExecucao } from '../../domain/status-execucao';

export const OS_SERVICE_CONFIG = Symbol('OS_SERVICE_CONFIG');

export type MetodoOsService = 'PATCH' | 'POST' | 'PUT';

/**
 * Contrato com o OS Service, todo configuravel por env (o os-service ainda nao
 * expoe estas rotas — ver README "Integracao com o OS Service"):
 * - OS_SERVICE_URL                 base (ex.: http://oficina-os-service)
 * - OS_SERVICE_MECANICO_PATH       default `/os/{osId}/mecanico`  body `{ mecanicoId }`
 * - OS_SERVICE_STATUS_PATH         default `/os/{osId}/status`    body `{ status }`
 * - OS_SERVICE_HTTP_METHOD         default PATCH
 * - OS_SERVICE_STATUS_MAP          JSON status local -> status da OS
 *                                  (default `{"EXECUTADA":"FINALIZADA"}`; demais iguais)
 * - OS_SERVICE_TIMEOUT_MS / OS_SERVICE_RETRIES   default 5000 / 2
 */
export interface OsServiceConfig {
  readonly baseUrl: string;
  readonly mecanicoPath: string;
  readonly statusPath: string;
  readonly metodo: MetodoOsService;
  readonly mapaStatus: Readonly<Partial<Record<StatusExecucao, string>>>;
  readonly timeoutMs: number;
  readonly retries: number;
}

export const MAPA_STATUS_PADRAO: Partial<Record<StatusExecucao, string>> = {
  [StatusExecucao.EXECUTADA]: 'FINALIZADA',
};

const METODOS: MetodoOsService[] = ['PATCH', 'POST', 'PUT'];

export function resolverOsServiceConfig(env: NodeJS.ProcessEnv = process.env): OsServiceConfig {
  const metodo = (env.OS_SERVICE_HTTP_METHOD || 'PATCH').toUpperCase() as MetodoOsService;
  if (!METODOS.includes(metodo)) {
    throw new Error(`OS_SERVICE_HTTP_METHOD invalido: ${metodo} (use ${METODOS.join(', ')})`);
  }
  let mapaStatus = MAPA_STATUS_PADRAO;
  if (env.OS_SERVICE_STATUS_MAP) {
    try {
      mapaStatus = JSON.parse(env.OS_SERVICE_STATUS_MAP) as typeof mapaStatus;
    } catch {
      throw new Error('OS_SERVICE_STATUS_MAP deve ser um JSON objeto (status local -> status OS)');
    }
  }
  return {
    baseUrl: (env.OS_SERVICE_URL ?? '').replace(/\/+$/, ''),
    mecanicoPath: env.OS_SERVICE_MECANICO_PATH || '/os/{osId}/mecanico',
    statusPath: env.OS_SERVICE_STATUS_PATH || '/os/{osId}/status',
    metodo,
    mapaStatus,
    timeoutMs: Number(env.OS_SERVICE_TIMEOUT_MS) || 5000,
    retries:
      env.OS_SERVICE_RETRIES === undefined ? 2 : Math.max(0, Number(env.OS_SERVICE_RETRIES) || 0),
  };
}

export function montarPath(template: string, osId: string): string {
  return template.replace('{osId}', encodeURIComponent(osId));
}
