import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Produto } from '../../domain/produto.entity';
import { PRODUTO_REPOSITORY, ProdutoRepository } from '../../domain/produto.repository';

@Injectable()
export class ListarProdutosUseCase implements UseCase<void, Produto[]> {
  constructor(@Inject(PRODUTO_REPOSITORY) private readonly repo: ProdutoRepository) {}

  async execute(): Promise<Produto[]> {
    return (await this.repo.listar()).sort((a, b) => a.nome.localeCompare(b.nome));
  }
}
