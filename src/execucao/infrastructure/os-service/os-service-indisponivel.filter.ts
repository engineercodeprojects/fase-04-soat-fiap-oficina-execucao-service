import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { OsServiceIndisponivelError } from '../../application/ports/os-service.gateway';

/** OS Service fora do ar => 502 (a operacao local ja foi desfeita/compensada). */
@Catch(OsServiceIndisponivelError)
export class OsServiceIndisponivelFilter implements ExceptionFilter {
  catch(exception: OsServiceIndisponivelError, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(HttpStatus.BAD_GATEWAY).json({
      statusCode: HttpStatus.BAD_GATEWAY,
      error: 'Bad Gateway',
      message: exception.message,
    });
  }
}
