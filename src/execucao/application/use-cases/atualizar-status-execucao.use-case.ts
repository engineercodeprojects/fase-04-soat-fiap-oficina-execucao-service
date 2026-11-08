import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser } from '@guilhermeqmaia/oficina-kit/auth';
import { DadoInvalidoError } from '../../../shared/domain/erros-de-dominio';
import { Execucao } from '../../domain/execucao.entity';
import { StatusExecucao } from '../../domain/status-execucao';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { OS_SERVICE_GATEWAY, OsServiceGateway } from '../ports/os-service.gateway';
import { carregarExecucao, exigirResponsavel, persistirEPropagar } from '../execucao.helpers';

/**
 * Status alteraveis diretamente. AGUARDANDO_APROVACAO e CANCELADA mexem no
 * estoque e tem rotas proprias (fechar-diagnostico / rollback).
 */
export const STATUS_ALTERAVEIS_DIRETAMENTE = [
  StatusExecucao.EM_DIAGNOSTICO,
  StatusExecucao.EM_EXECUCAO,
  StatusExecucao.EXECUTADA,
] as const;

export interface AtualizarStatusExecucaoInput {
  osId: string;
  status: StatusExecucao;
  ator?: AuthenticatedUser;
}

@Injectable()
export class AtualizarStatusExecucaoUseCase implements UseCase<
  AtualizarStatusExecucaoInput,
  Execucao
> {
  constructor(
    @Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository,
    @Inject(OS_SERVICE_GATEWAY) private readonly os: OsServiceGateway,
  ) {}

  async execute({ osId, status, ator }: AtualizarStatusExecucaoInput): Promise<Execucao> {
    if (!(STATUS_ALTERAVEIS_DIRETAMENTE as readonly StatusExecucao[]).includes(status)) {
      throw new DadoInvalidoError(
        `Status ${status} nao pode ser definido diretamente: use fechar-diagnostico ou rollback`,
      );
    }
    const execucao = await carregarExecucao(this.repo, osId);
    exigirResponsavel(execucao, ator);
    const anterior = execucao.toJSON();
    execucao.transitarPara(status);
    await persistirEPropagar(this.repo, execucao, anterior, () =>
      this.os.atualizarStatus(osId, status),
    );
    return execucao;
  }
}
