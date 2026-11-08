import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Produto } from '../../domain/produto.entity';
import { PRODUTO_REPOSITORY, ProdutoRepository } from '../../domain/produto.repository';
import { ProdutoNaoEncontradoError } from '../../domain/errors/produto-nao-encontrado.error';

@Injectable()
export class BuscarProdutoUseCase implements UseCase<{ produtoId: string }, Produto> {
  constructor(@Inject(PRODUTO_REPOSITORY) private readonly repo: ProdutoRepository) {}

  async execute({ produtoId }: { produtoId: string }): Promise<Produto> {
    const produto = await this.repo.buscarPorId(produtoId);
    if (!produto) throw new ProdutoNaoEncontradoError(produtoId);
    return produto;
  }
}
