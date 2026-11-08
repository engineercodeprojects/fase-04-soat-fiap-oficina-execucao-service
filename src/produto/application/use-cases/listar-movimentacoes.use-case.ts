import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { MovimentacaoEstoque } from '../../domain/movimentacao-estoque';
import { ESTOQUE_REPOSITORY, EstoqueRepository } from '../../domain/produto.repository';

export type FiltroMovimentacoes = { produtoId: string } | { osId: string };

@Injectable()
export class ListarMovimentacoesUseCase implements UseCase<
  FiltroMovimentacoes,
  MovimentacaoEstoque[]
> {
  constructor(@Inject(ESTOQUE_REPOSITORY) private readonly estoque: EstoqueRepository) {}

  async execute(filtro: FiltroMovimentacoes): Promise<MovimentacaoEstoque[]> {
    const lista =
      'produtoId' in filtro
        ? await this.estoque.listarPorProduto(filtro.produtoId)
        : await this.estoque.listarPorOs(filtro.osId);
    return lista.sort((a, b) => a.data.localeCompare(b.data));
  }
}
