import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Produto } from '../../domain/produto.entity';
import { PRODUTO_REPOSITORY, ProdutoRepository } from '../../domain/produto.repository';
import { SkuDuplicadoError } from '../../domain/errors/sku-duplicado.error';

export interface CriarProdutoInput {
  nome: string;
  sku: string;
  preco: number;
  quantidadeEstoque?: number;
}

/** Cadastra o produto com o saldo inicial (carga inicial do estoque). */
@Injectable()
export class CriarProdutoUseCase implements UseCase<CriarProdutoInput, Produto> {
  constructor(@Inject(PRODUTO_REPOSITORY) private readonly repo: ProdutoRepository) {}

  async execute(input: CriarProdutoInput): Promise<Produto> {
    const produto = Produto.criar({ produtoId: randomUUID(), ...input });
    if (await this.repo.buscarPorSku(produto.sku)) throw new SkuDuplicadoError(produto.sku);
    await this.repo.criar(produto);
    return produto;
  }
}
