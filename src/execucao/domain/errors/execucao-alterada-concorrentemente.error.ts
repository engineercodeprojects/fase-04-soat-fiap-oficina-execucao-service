import { ConflitoDeNegocioError } from '../../../shared/domain/erros-de-dominio';

/** Lock otimista (`versao`): outra requisicao alterou a execucao no meio do caminho. */
export class ExecucaoAlteradaConcorrentementeError extends ConflitoDeNegocioError {
  constructor(osId: string) {
    super(`Execucao da OS ${osId} foi alterada por outra operacao; tente novamente`);
  }
}
