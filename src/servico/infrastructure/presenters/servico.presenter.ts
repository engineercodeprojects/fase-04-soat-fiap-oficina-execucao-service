import { Servico, ServicoProps } from '../../domain/servico.entity';

export const ServicoPresenter = {
  toResponse: (servico: Servico): ServicoProps => servico.toJSON(),
};
