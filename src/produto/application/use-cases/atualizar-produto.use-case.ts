import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Produto } from '../../domain/produto.entity';
import { PRODUTO_REPOSITORY, ProdutoRepository } from '../../domain/produto.repository';
import { ProdutoNaoEncontradoError } from '../../domain/errors/produto-nao-encontrado.error';
import { SkuDuplicadoError } from '../../domain/errors/sku-duplicado.error';

export interface AtualizarProdutoInput {
  produtoId: string;
  nome?: string;
  sku?: string;
  preco?: number;
}

/** Edita o cadastro. O saldo nao e editavel aqui: use entradas de estoque. */
@Injectable()
export class AtualizarProdutoUseCase implements UseCase<AtualizarProdutoInput, Produto> {
  constructor(@Inject(PRODUTO_REPOSITORY) private readonly repo: ProdutoRepository) {}

  async execute({ produtoId, ...dados }: AtualizarProdutoInput): Promise<Produto> {
    const produto = await this.repo.buscarPorId(produtoId);
    if (!produto) throw new ProdutoNaoEncontradoError(produtoId);
    if (dados.sku !== undefined) {
      const sku = Produto.normalizarSku(dados.sku);
      const outro = await this.repo.buscarPorSku(sku);
      if (outro && outro.produtoId !== produtoId) throw new SkuDuplicadoError(sku);
    }
    produto.atualizarCadastro(dados);
    await this.repo.atualizarCadastro(produto);
    return produto;
  }
}
