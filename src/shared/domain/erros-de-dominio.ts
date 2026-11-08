import { DomainError, DomainErrorKind } from '@guilhermeqmaia/oficina-kit/core';

/** Regra de validacao de entrada violada (400). */
export class DadoInvalidoError extends DomainError {
  readonly kind = DomainErrorKind.INVALID_INPUT;
  constructor(mensagem: string) {
    super(mensagem);
  }
}

/** Estado conflitante / recusa de negocio (409). */
export class ConflitoDeNegocioError extends DomainError {
  readonly kind = DomainErrorKind.CONFLICT;
  constructor(mensagem: string) {
    super(mensagem);
  }
}
