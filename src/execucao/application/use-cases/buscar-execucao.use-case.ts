import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { carregarExecucao, exigirResponsavel } from '../execucao.helpers';

@Injectable()
export class BuscarExecucaoUseCase implements UseCase<
  { osId: string; ator?: AuthenticatedUser },
  Execucao
> {
  constructor(@Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository) {}

  async execute({ osId, ator }: { osId: string; ator?: AuthenticatedUser }): Promise<Execucao> {
    const execucao = await carregarExecucao(this.repo, osId);
    exigirResponsavel(execucao, ator);
    return execucao;
  }
}
