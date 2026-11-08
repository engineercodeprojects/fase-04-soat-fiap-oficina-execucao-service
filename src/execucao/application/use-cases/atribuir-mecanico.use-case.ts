import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser, Role } from '@guilhermeqmaia/oficina-kit/auth';
import { NotOwnedByUserError } from '@guilhermeqmaia/oficina-kit/core';
import { Execucao } from '../../domain/execucao.entity';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { carregarExecucao } from '../execucao.helpers';

export interface AtribuirMecanicoInput {
  osId: string;
  mecanicoId: string;
  ator?: AuthenticatedUser;
}

/**
 * Tira a OS da fila atribuindo o mecanico (ADMIN atribui qualquer um; MECANICO
 * so a si mesmo) ou reatribui durante o diagnostico. Mesmo mecanico = idempotente.
 * O OS Service recebe o mecanicoId no callback do diagnostico.
 */
@Injectable()
export class AtribuirMecanicoUseCase implements UseCase<AtribuirMecanicoInput, Execucao> {
  constructor(@Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository) {}

  async execute({ osId, mecanicoId, ator }: AtribuirMecanicoInput): Promise<Execucao> {
    if (ator?.role === Role.MECANICO && ator.id !== mecanicoId) {
      throw new NotOwnedByUserError('Execucao', osId);
    }
    const execucao = await carregarExecucao(this.repo, osId);
    if (execucao.mecanicoId === mecanicoId) return execucao;
    if (ator?.role === Role.MECANICO && execucao.mecanicoId) {
      throw new NotOwnedByUserError('Execucao', osId);
    }
    execucao.atribuirMecanico(mecanicoId);
    await this.repo.salvar(execucao);
    return execucao;
  }
}
