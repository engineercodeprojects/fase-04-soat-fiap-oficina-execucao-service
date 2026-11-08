import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { OS_SERVICE_GATEWAY, OsServiceGateway } from '../ports/os-service.gateway';
import { carregarExecucao, exigirResponsavel, persistirEPropagar } from '../execucao.helpers';

/** Mecanico conclui o servico: EXECUTADA + callback `execucao.finalizada` (status revertido se falhar). */
@Injectable()
export class FinalizarExecucaoUseCase implements UseCase<
  { osId: string; ator?: AuthenticatedUser },
  Execucao
> {
  constructor(
    @Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository,
    @Inject(OS_SERVICE_GATEWAY) private readonly os: OsServiceGateway,
  ) {}

  async execute({ osId, ator }: { osId: string; ator?: AuthenticatedUser }): Promise<Execucao> {
    const execucao = await carregarExecucao(this.repo, osId);
    exigirResponsavel(execucao, ator);
    const anterior = execucao.toJSON();
    execucao.finalizar();
    await persistirEPropagar(this.repo, execucao, anterior, () =>
      this.os.execucaoFinalizada({
        numeroOS: osId,
        finalizadaEm: execucao.finalizadaEm as string,
      }),
    );
    return execucao;
  }
}
