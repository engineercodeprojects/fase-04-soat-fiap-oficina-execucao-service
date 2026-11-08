import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { exigirQuantidade } from '../../../shared/domain/validacoes';
import { Produto } from '../../domain/produto.entity';
import { TipoMovimentacao } from '../../domain/movimentacao-estoque';
import {
  ESTOQUE_REPOSITORY,
  EstoqueRepository,
  PRODUTO_REPOSITORY,
  ProdutoRepository,
} from '../../domain/produto.repository';
import { ProdutoNaoEncontradoError } from '../../domain/errors/produto-nao-encontrado.error';

/** Reposicao de estoque (compra/recebimento): movimentacao ENTRADA auditada. */
@Injectable()
export class RegistrarEntradaEstoqueUseCase implements UseCase<
  { produtoId: string; quantidade: number },
  Produto
> {
  constructor(
    @Inject(PRODUTO_REPOSITORY) private readonly produtos: ProdutoRepository,
    @Inject(ESTOQUE_REPOSITORY) private readonly estoque: EstoqueRepository,
  ) {}

  async execute({ produtoId, quantidade }: { produtoId: string; quantidade: number }) {
    exigirQuantidade(quantidade, 'quantidade');
    await this.estoque.aplicar([
      {
        movimentacaoId: randomUUID(),
        produtoId,
        tipo: TipoMovimentacao.ENTRADA,
        quantidade,
        osId: null,
        servicoId: null,
        data: new Date().toISOString(),
      },
    ]);
    const produto = await this.produtos.buscarPorId(produtoId);
    if (!produto) throw new ProdutoNaoEncontradoError(produtoId);
    return produto;
  }
}
