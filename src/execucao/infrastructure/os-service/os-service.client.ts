import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClienteHttpInterno,
  HttpInternoError,
  criarEnvelopeHttp,
} from '@guilhermeqmaia/oficina-kit/http';
import { OsServiceRecusouError } from '../../domain/errors/os-service-recusou.error';
import {
  DiagnosticoConcluido,
  OsServiceGateway,
  OsServiceIndisponivelError,
} from '../../application/ports/os-service.gateway';

export const PRODUCER = 'execucao-service';

/**
 * Callbacks para o OS Service (RFC-0008): `POST {OS_SERVICE_URL}/ordens-servico/{numeroOS}/eventos`
 * com o envelope do kit. `ClienteHttpInterno` assina com JWT de servico
 * (`role: SERVICO`), propaga `x-correlation-id` (= numeroOS) e repete so em
 * 5xx/timeout. 4xx -> OsServiceRecusouError (409); falha transitoria -> 502.
 */
@Injectable()
export class OsServiceClient implements OsServiceGateway {
  private readonly logger = new Logger(OsServiceClient.name);
  private readonly baseUrl: string;

  constructor(
    @Inject(ClienteHttpInterno) private readonly http: ClienteHttpInterno,
    config: ConfigService,
  ) {
    this.baseUrl = (config.get<string>('OS_SERVICE_URL') ?? '').replace(/\/+$/, '');
  }

  diagnosticoConcluido(evento: DiagnosticoConcluido): Promise<void> {
    return this.enviar(evento.numeroOS, 'execucao.diagnostico-concluido', evento);
  }

  execucaoFinalizada(evento: { numeroOS: string; finalizadaEm: string }): Promise<void> {
    return this.enviar(evento.numeroOS, 'execucao.finalizada', evento);
  }

  private async enviar(numeroOS: string, type: string, data: object): Promise<void> {
    if (!this.baseUrl) {
      this.logger.warn(`OS_SERVICE_URL ausente: callback ${type} da OS ${numeroOS} ignorado (dev)`);
      return;
    }
    const url = `${this.baseUrl}/ordens-servico/${encodeURIComponent(numeroOS)}/eventos`;
    const envelope = criarEnvelopeHttp({ type, data, producer: PRODUCER });
    try {
      await this.http.post(url, envelope, { correlationId: numeroOS });
    } catch (e) {
      if (e instanceof HttpInternoError && e.status !== undefined && e.status < 500) {
        const corpo = (e.body ?? {}) as { motivo?: string; message?: string | string[] };
        const motivo = corpo.motivo ?? [corpo.message ?? 'sem detalhes'].flat().join('; ');
        throw new OsServiceRecusouError(e.status, motivo);
      }
      throw new OsServiceIndisponivelError(`OS Service indisponivel (callback ${type})`, e);
    }
  }
}
