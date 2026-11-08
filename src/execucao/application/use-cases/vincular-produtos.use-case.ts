import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { PRODUTO_REPOSITORY, ProdutoRepository } from '../../../produto/domain/produto.repository';
import { ProdutoNaoEncontradoError } from '../../../produto/domain/errors/produto-nao-encontrado.error';
import { carregarExecucao, exigirResponsavel } from '../execucao.helpers';

export interface VincularProdutosInput {
  osId: string;
  servicoId: string;
  produtos: { produtoId: string; quantidade: number }[];
  ator?: AuthenticatedUser;
}

/**
 * Vincula pecas a um servico da OS (preco congelado). O saldo nao e reservado
 * aqui: a baixa acontece no fechamento do diagnostico, de forma atomica.
 */
@Injectable()
export class VincularProdutosUseCase implements UseCase<VincularProdutosInput, Execucao> {
  constructor(
    @Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository,
    @Inject(PRODUTO_REPOSITORY) private readonly produtos: ProdutoRepository,
  ) {}

  async execute({ osId, servicoId, produtos, ator }: VincularProdutosInput): Promise<Execucao> {
    const execucao = await carregarExecucao(this.repo, osId);
    exigirResponsavel(execucao, ator);
    const catalogo = await this.produtos.buscarPorIds([
      ...new Set(produtos.map((p) => p.produtoId)),
    ]);
    for (const { produtoId, quantidade } of produtos) {
      const produto = catalogo.get(produtoId);
      if (!produto) throw new ProdutoNaoEncontradoError(produtoId);
      execucao.vincularProduto(servicoId, {
        produtoId,
        nome: produto.nome,
        sku: produto.sku,
        precoUnitario: produto.preco,
        quantidade,
      });
    }
    await this.repo.salvar(execucao);
    return execucao;
  }
}
