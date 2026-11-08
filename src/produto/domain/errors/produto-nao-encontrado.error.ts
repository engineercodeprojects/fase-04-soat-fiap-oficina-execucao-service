import { EntityNotFoundError } from '@guilhermeqmaia/oficina-kit/core';

export class ProdutoNaoEncontradoError extends EntityNotFoundError {
  constructor(produtoId: string) {
    super('Produto', produtoId);
  }
}
