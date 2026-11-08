import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AxiosInstance } from 'axios';
import { isAxiosError } from 'axios';
import { EmissorTokenServico } from '@guilhermeqmaia/oficina-kit/http';
import { StatusExecucao } from '../../domain/status-execucao';
import { OsServiceRecusouError } from '../../domain/errors/os-service-recusou.error';
import {
  OsServiceGateway,
  OsServiceIndisponivelError,
} from '../../application/ports/os-service.gateway';
import { OS_SERVICE_CONFIG, OsServiceConfig, montarPath } from './os-service.config';

export const EMISSOR_TOKEN_SERVICO = Symbol('EMISSOR_TOKEN_SERVICO');
export const OS_SERVICE_HTTP = Symbol('OS_SERVICE_HTTP');

/**
 * Adapter HTTP (axios) para o OS Service. Autentica com JWT de
 * servico (`role: SERVICO`, `sub: execucao-service`, mesmo JWT_SECRET) e envia
 * `x-correlation-id` = osId. Retry com backoff so para timeout/rede/5xx; 4xx
 * vira OsServiceRecusouError (409) sem retry.
 */
@Injectable()
export class OsServiceClient implements OsServiceGateway {
  private readonly logger = new Logger(OsServiceClient.name);

  constructor(
    @Inject(OS_SERVICE_HTTP) private readonly http: AxiosInstance,
    @Inject(OS_SERVICE_CONFIG) private readonly config: OsServiceConfig,
    @Inject(EMISSOR_TOKEN_SERVICO) private readonly emissor: EmissorTokenServico,
  ) {}

  async atribuirMecanico(osId: string, mecanicoId: string): Promise<void> {
    await this.enviar(osId, montarPath(this.config.mecanicoPath, osId), { mecanicoId });
  }

  async atualizarStatus(osId: string, status: StatusExecucao): Promise<void> {
    const statusOs = this.config.mapaStatus[status] ?? status;
    await this.enviar(osId, montarPath(this.config.statusPath, osId), { status: statusOs });
  }

  private async enviar(osId: string, path: string, data: Record<string, unknown>): Promise<void> {
    if (!this.config.baseUrl) {
      this.logger.warn(`OS_SERVICE_URL ausente: propagacao ${path} ignorada (somente dev)`);
      return;
    }
    const url = `${this.config.baseUrl}${path}`;
    for (let tentativa = 1; ; tentativa++) {
      try {
        await this.http.request({
          method: this.config.metodo,
          url,
          data,
          timeout: this.config.timeoutMs,
          headers: {
            authorization: `Bearer ${this.emissor.token()}`,
            'x-correlation-id': osId,
          },
        });
        return;
      } catch (e) {
        const status = isAxiosError(e) ? e.response?.status : undefined;
        if (status !== undefined && status < 500) {
          const corpo = (isAxiosError(e) ? e.response?.data : undefined) as
            { motivo?: string; message?: string | string[] } | undefined;
          const motivo = corpo?.motivo ?? [corpo?.message ?? 'sem detalhes'].flat().join('; ');
          throw new OsServiceRecusouError(status, motivo);
        }
        if (tentativa > this.config.retries) {
          throw new OsServiceIndisponivelError(
            `OS Service indisponivel (${this.config.metodo} ${path}, ${tentativa} tentativas)`,
            e,
          );
        }
        await new Promise((r) => setTimeout(r, 200 * 2 ** (tentativa - 1)));
      }
    }
  }
}
