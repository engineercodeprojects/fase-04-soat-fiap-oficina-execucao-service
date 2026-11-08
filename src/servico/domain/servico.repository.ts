import { Servico } from './servico.entity';

export const SERVICO_REPOSITORY = Symbol('SERVICO_REPOSITORY');

export interface ServicoRepository {
  salvar(servico: Servico): Promise<void>;
  buscarPorId(servicoId: string): Promise<Servico | null>;
  listar(): Promise<Servico[]>;
  remover(servicoId: string): Promise<void>;
}
