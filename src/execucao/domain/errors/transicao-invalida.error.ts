import { ConflitoDeNegocioError } from '../../../shared/domain/erros-de-dominio';
import { StatusExecucao } from '../status-execucao';

export class TransicaoDeStatusInvalidaError extends ConflitoDeNegocioError {
  constructor(
    readonly de: StatusExecucao,
    readonly para: StatusExecucao,
  ) {
    super(`Transicao de status invalida: ${de} -> ${para}`);
  }
}
