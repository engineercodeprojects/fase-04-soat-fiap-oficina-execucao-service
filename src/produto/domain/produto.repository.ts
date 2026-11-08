import { Produto } from './produto.entity';
import { MovimentacaoEstoque } from './movimentacao-estoque';

export const PRODUTO_REPOSITORY = Symbol('PRODUTO_REPOSITORY');

export interface ProdutoRepository {
  /** Insere um produto novo (falha se o id ja existir). */
  criar(produto: Produto): Promise<void>;
  /** Atualiza nome/sku/preco sem tocar no saldo (que so muda por movimentacao). */
  atualizarCadastro(produto: Produto): Promise<void>;
  buscarPorId(produtoId: string): Promise<Produto | null>;
  buscarPorIds(produtoIds: string[]): Promise<Map<string, Produto>>;
  buscarPorSku(sku: string): Promise<Produto | null>;
  listar(): Promise<Produto[]>;
  remover(produtoId: string): Promise<void>;
}

export const ESTOQUE_REPOSITORY = Symbol('ESTOQUE_REPOSITORY');

export interface EstoqueRepository {
  /**
   * Aplica as movimentacoes atomicamente (tudo ou nada): ajusta o saldo de cada
   * produto e grava o registro de auditoria. Lanca EstoqueInsuficienteError se
   * alguma baixa deixaria saldo negativo, e ProdutoNaoEncontradoError se o produto
   * nao existe.
   */
  aplicar(movimentacoes: MovimentacaoEstoque[]): Promise<void>;
  listarPorOs(osId: string): Promise<MovimentacaoEstoque[]>;
  listarPorProduto(produtoId: string): Promise<MovimentacaoEstoque[]>;
}
