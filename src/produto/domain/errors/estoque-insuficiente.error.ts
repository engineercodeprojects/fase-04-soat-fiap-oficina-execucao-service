import { ConflitoDeNegocioError } from '../../../shared/domain/erros-de-dominio';

export interface ItemEmFalta {
  produtoId: string;
  solicitado: number;
  disponivel: number | null;
}

/** Saldo nao cobre a baixa (409). `disponivel` e null quando detectado so pela condicao do banco. */
export class EstoqueInsuficienteError extends ConflitoDeNegocioError {
  constructor(readonly itens: ItemEmFalta[]) {
    super(
      `Estoque insuficiente: ${itens
        .map(
          (i) =>
            `${i.produtoId} (solicitado ${i.solicitado}` +
            (i.disponivel === null ? ')' : `, disponivel ${i.disponivel})`),
        )
        .join('; ')}`,
    );
  }
}
