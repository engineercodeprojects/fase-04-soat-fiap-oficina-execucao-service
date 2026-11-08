import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { carregarExecucao, exigirResponsavel } from '../execucao.helpers';

@Injectable()
export class RemoverServicoDaExecucaoUseCase implements UseCase<
  { osId: string; servicoId: string; ator?: AuthenticatedUser },
  Execucao
> {
  constructor(@Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository) {}

  async execute(input: { osId: string; servicoId: string; ator?: AuthenticatedUser }) {
    const execucao = await carregarExecucao(this.repo, input.osId);
    exigirResponsavel(execucao, input.ator);
    execucao.removerServico(input.servicoId);
    await this.repo.salvar(execucao);
    return execucao;
  }
}
