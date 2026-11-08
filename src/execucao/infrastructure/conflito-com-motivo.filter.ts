import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  DomainError,
  DomainErrorKind,
  DomainExceptionFilter,
} from '@guilhermeqmaia/oficina-kit/core';

/**
 * Contrato HTTP interno: recusa de negocio = `409 { motivo }` (o OS Service le
 * `motivo` para montar `execucao.recusada`). Demais erros de dominio seguem o
 * filtro padrao do kit.
 */
@Catch(DomainError)
export class ConflitoComMotivoFilter implements ExceptionFilter {
  private readonly padrao = new DomainExceptionFilter();

  catch(exception: DomainError, host: ArgumentsHost): void {
    if (exception.kind !== DomainErrorKind.CONFLICT) {
      this.padrao.catch(exception, host);
      return;
    }
    host.switchToHttp().getResponse<Response>().status(HttpStatus.CONFLICT).json({
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: exception.message,
      motivo: exception.message,
    });
  }
}
