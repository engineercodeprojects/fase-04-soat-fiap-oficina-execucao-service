import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ItemDeBaixa, planejarBaixa, planejarDevolucao, validarSaldo } from '../../domain/estoque';
import { MovimentacaoEstoque } from '../../domain/movimentacao-estoque';
import {
  ESTOQUE_REPOSITORY,
  EstoqueRepository,
  PRODUTO_REPOSITORY,
  ProdutoRepository,
} from '../../domain/produto.repository';

/**
 * Porta de estoque usada pela Execucao: baixa das pecas no fechamento do
 * diagnostico e devolucao (rollback) quando o orcamento e reprovado.
 */
@Injectable()
export class EstoqueService {
  constructor(
    @Inject(PRODUTO_REPOSITORY) private readonly produtos: ProdutoRepository,
    @Inject(ESTOQUE_REPOSITORY) private readonly estoque: EstoqueRepository,
  ) {}

  async baixarParaOs(osId: string, itens: ItemDeBaixa[]): Promise<MovimentacaoEstoque[]> {
    if (!itens.length) return [];
    const produtos = await this.produtos.buscarPorIds([...new Set(itens.map((i) => i.produtoId))]);
    validarSaldo(itens, produtos);
    const movimentacoes = planejarBaixa(osId, itens, randomUUID);
    await this.estoque.aplicar(movimentacoes);
    return movimentacoes;
  }

  async devolverDaOs(osId: string): Promise<MovimentacaoEstoque[]> {
    const historico = await this.estoque.listarPorOs(osId);
    const devolucoes = planejarDevolucao(osId, historico, randomUUID);
    if (devolucoes.length) await this.estoque.aplicar(devolucoes);
    return devolucoes;
  }
}
