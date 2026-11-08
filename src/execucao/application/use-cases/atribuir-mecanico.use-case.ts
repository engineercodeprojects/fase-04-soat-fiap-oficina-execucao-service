import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { OS_SERVICE_GATEWAY, OsServiceGateway } from '../ports/os-service.gateway';
import { persistirEPropagar } from '../execucao.helpers';

export interface AtribuirMecanicoInput {
  osId: string;
  mecanicoId: string;
  ator?: AuthenticatedUser;
}

/**
 * Cria a execucao da OS com o mecanico (ou reatribui, durante o diagnostico) e
 * propaga a atribuicao ao OS Service. Se o OS Service recusar/estiver fora, a
 * gravacao local e desfeita. Repetir com o mesmo mecanico e idempotente.
 */
@Injectable()
export class AtribuirMecanicoUseCase implements UseCase<AtribuirMecanicoInput, Execucao> {
  constructor(
    @Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository,
    @Inject(OS_SERVICE_GATEWAY) private readonly os: OsServiceGateway,
  ) {}

  async execute({ osId, mecanicoId }: AtribuirMecanicoInput): Promise<Execucao> {
    const existente = await this.repo.buscarPorOsId(osId);
    const execucao = existente ?? Execucao.atribuir(osId, mecanicoId);
    const anterior = execucao.toJSON();
    if (existente) {
      if (existente.mecanicoId === mecanicoId) {
        await this.os.atribuirMecanico(osId, mecanicoId);
        return existente;
      }
      existente.reatribuirMecanico(mecanicoId);
    }
    await persistirEPropagar(this.repo, execucao, anterior, () =>
      this.os.atribuirMecanico(osId, execucao.mecanicoId),
    );
    return execucao;
  }
}
