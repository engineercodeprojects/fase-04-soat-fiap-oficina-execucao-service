import { EntityNotFoundError } from '@guilhermeqmaia/oficina-kit/core';

export class ServicoNaoEncontradoError extends EntityNotFoundError {
  constructor(servicoId: string) {
    super('Servico', servicoId);
  }
}
