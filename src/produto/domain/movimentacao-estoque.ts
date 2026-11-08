export enum TipoMovimentacao {
  ENTRADA = 'ENTRADA',
  BAIXA = 'BAIXA',
  DEVOLUCAO = 'DEVOLUCAO',
}

/** Registro imutavel (auditoria) de toda alteracao de saldo de um produto. */
export interface MovimentacaoEstoque {
  readonly movimentacaoId: string;
  readonly produtoId: string;
  readonly tipo: TipoMovimentacao;
  readonly quantidade: number;
  readonly osId: string | null;
  readonly servicoId: string | null;
  readonly data: string;
}

/** Efeito no saldo: BAIXA subtrai; ENTRADA e DEVOLUCAO somam. */
export function deltaDoSaldo(m: Pick<MovimentacaoEstoque, 'tipo' | 'quantidade'>): number {
  return m.tipo === TipoMovimentacao.BAIXA ? -m.quantidade : m.quantidade;
}
