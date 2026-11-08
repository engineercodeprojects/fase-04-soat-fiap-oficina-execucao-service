import { ConflitoDeNegocioError } from '../../../shared/domain/erros-de-dominio';

/** OS Service respondeu 4xx (ex.: 409 `{ motivo }`): recusa de negocio, propagada como 409. */
export class OsServiceRecusouError extends ConflitoDeNegocioError {
  constructor(
    readonly statusHttp: number,
    readonly motivo: string,
  ) {
    super(`OS Service recusou a operacao (${statusHttp}): ${motivo}`);
  }
}
