import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { PRODUTO_REPOSITORY, ProdutoRepository } from '../../domain/produto.repository';
import { ProdutoNaoEncontradoError } from '../../domain/errors/produto-nao-encontrado.error';

/** Remove do catalogo; o historico de movimentacoes e preservado para auditoria. */
@Injectable()
export class RemoverProdutoUseCase implements UseCase<{ produtoId: string }, void> {
  constructor(@Inject(PRODUTO_REPOSITORY) private readonly repo: ProdutoRepository) {}

  async execute({ produtoId }: { produtoId: string }): Promise<void> {
    if (!(await this.repo.buscarPorId(produtoId))) throw new ProdutoNaoEncontradoError(produtoId);
    await this.repo.remover(produtoId);
  }
}
