import { EntityNotFoundError } from '@guilhermeqmaia/oficina-kit/core';

export class ExecucaoNaoEncontradaError extends EntityNotFoundError {
  constructor(osId: string) {
    super('Execucao', osId);
  }
}
