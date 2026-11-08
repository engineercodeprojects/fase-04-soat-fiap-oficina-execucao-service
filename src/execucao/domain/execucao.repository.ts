import { Execucao } from './execucao.entity';
import { StatusExecucao } from './status-execucao';

export const EXECUCAO_REPOSITORY = Symbol('EXECUCAO_REPOSITORY');

export interface FiltroExecucoes {
  mecanicoId?: string;
  status?: StatusExecucao;
}

export interface ExecucaoRepository {
  /**
   * Grava com lock otimista: insere se `versao === 0`, senao exige que a versao
   * no banco seja a mesma lida. Lanca ExecucaoAlteradaConcorrentementeError.
   */
  salvar(execucao: Execucao): Promise<void>;
  buscarPorOsId(osId: string): Promise<Execucao | null>;
  listar(filtro: FiltroExecucoes): Promise<Execucao[]>;
  /** Compensacao de uma atribuicao recem-criada que o OS Service recusou. */
  remover(osId: string, versao: number): Promise<void>;
}
