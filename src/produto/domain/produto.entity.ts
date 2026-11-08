import { exigirPreco, exigirQuantidade, exigirTexto } from '../../shared/domain/validacoes';

export interface ProdutoProps {
  produtoId: string;
  nome: string;
  sku: string;
  preco: number;
  quantidadeEstoque: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Peca/insumo do catalogo com seu saldo em estoque. O saldo so muda por
 * movimentacao (entrada, baixa, devolucao) — nunca por edicao de cadastro —
 * para que toda alteracao fique auditada em `movimentacoes_estoque`.
 */
export class Produto {
  private constructor(private props: ProdutoProps) {}

  static criar(
    input: {
      produtoId: string;
      nome: string;
      sku: string;
      preco: number;
      quantidadeEstoque?: number;
    },
    agora: Date = new Date(),
  ): Produto {
    const iso = agora.toISOString();
    return new Produto({
      produtoId: input.produtoId,
      nome: exigirTexto(input.nome, 'nome'),
      sku: Produto.normalizarSku(input.sku),
      preco: exigirPreco(input.preco, 'preco'),
      quantidadeEstoque: exigirQuantidade(input.quantidadeEstoque ?? 0, 'quantidadeEstoque', 0),
      createdAt: iso,
      updatedAt: iso,
    });
  }

  static reconstituir(props: ProdutoProps): Produto {
    return new Produto({ ...props });
  }

  static normalizarSku(sku: string): string {
    return exigirTexto(sku, 'sku').toUpperCase();
  }

  atualizarCadastro(
    input: { nome?: string; sku?: string; preco?: number },
    agora: Date = new Date(),
  ): void {
    if (input.nome !== undefined) this.props.nome = exigirTexto(input.nome, 'nome');
    if (input.sku !== undefined) this.props.sku = Produto.normalizarSku(input.sku);
    if (input.preco !== undefined) this.props.preco = exigirPreco(input.preco, 'preco');
    this.props.updatedAt = agora.toISOString();
  }

  possuiSaldo(quantidade: number): boolean {
    return this.props.quantidadeEstoque >= quantidade;
  }

  get produtoId() {
    return this.props.produtoId;
  }
  get nome() {
    return this.props.nome;
  }
  get sku() {
    return this.props.sku;
  }
  get preco() {
    return this.props.preco;
  }
  get quantidadeEstoque() {
    return this.props.quantidadeEstoque;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  toJSON(): ProdutoProps {
    return { ...this.props };
  }
}
