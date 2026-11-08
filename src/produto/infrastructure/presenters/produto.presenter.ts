import { Produto, ProdutoProps } from '../../domain/produto.entity';

export const ProdutoPresenter = {
  toResponse: (produto: Produto): ProdutoProps => produto.toJSON(),
};
