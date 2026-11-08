import { Execucao, ExecucaoProps } from '../../domain/execucao.entity';

export type ExecucaoResponse = ExecucaoProps & { valorTotal: number };

export const ExecucaoPresenter = {
  toResponse: (execucao: Execucao): ExecucaoResponse => ({
    ...execucao.toJSON(),
    valorTotal: execucao.valorTotal,
  }),
};
