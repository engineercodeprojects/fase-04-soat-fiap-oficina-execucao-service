import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { ConflitoDeNegocioError } from '../../../shared/domain/erros-de-dominio';
import { Execucao } from '../../domain/execucao.entity';
import { StatusExecucao, emAndamento } from '../../domain/status-execucao';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';

export interface EnfileirarExecucaoInput {
  numeroOS: string;
  veiculoId: string;
  descricaoProblema?: string;
}

export interface EnfileirarExecucaoOutput {
  execucao: Execucao;
  posicaoFila: number;
}

/**
 * `execucao.enfileirar` (OS Service): cria a execucao NA_FILA. Idempotente por
 * numeroOS (repetir devolve a mesma execucao). Recusa (409) se o veiculo ja tem
 * outra OS em andamento na oficina.
 */
@Injectable()
export class EnfileirarExecucaoUseCase implements UseCase<
  EnfileirarExecucaoInput,
  EnfileirarExecucaoOutput
> {
  constructor(@Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository) {}

  async execute(input: EnfileirarExecucaoInput): Promise<EnfileirarExecucaoOutput> {
    let execucao = await this.repo.buscarPorOsId(input.numeroOS);
    if (!execucao) {
      const doVeiculo = await this.repo.listar({ veiculoId: input.veiculoId });
      const emCurso = doVeiculo.find((e) => emAndamento(e.status));
      if (emCurso) {
        throw new ConflitoDeNegocioError(
          `Veiculo ${input.veiculoId} ja esta em execucao na OS ${emCurso.osId}`,
        );
      }
      execucao = Execucao.enfileirar({ osId: input.numeroOS, ...input });
      await this.repo.salvar(execucao);
    }
    return { execucao, posicaoFila: await this.posicaoNaFila(execucao) };
  }

  /** 1-based entre as NA_FILA por ordem de chegada; 0 se ja saiu da fila. */
  private async posicaoNaFila(execucao: Execucao): Promise<number> {
    if (execucao.status !== StatusExecucao.NA_FILA) return 0;
    const fila = await this.repo.listar({ status: StatusExecucao.NA_FILA });
    return (
      fila.filter((e) => e.createdAt <= execucao.createdAt && e.osId !== execucao.osId).length + 1
    );
  }
}
