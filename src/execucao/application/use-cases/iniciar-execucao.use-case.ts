import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Execucao } from '../../domain/execucao.entity';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { carregarExecucao } from '../execucao.helpers';

/**
 * `execucao.iniciar` (OS Service, orcamento aprovado): AGUARDANDO_APROVACAO ->
 * EM_EXECUCAO. As pecas ja foram baixadas no fechamento do diagnostico.
 * Idempotente; 409 se a execucao nao esta aguardando aprovacao.
 */
@Injectable()
export class IniciarExecucaoUseCase implements UseCase<{ osId: string }, Execucao> {
  constructor(@Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository) {}

  async execute({ osId }: { osId: string }): Promise<Execucao> {
    const execucao = await carregarExecucao(this.repo, osId);
    if (execucao.iniciarExecucao()) await this.repo.salvar(execucao);
    return execucao;
  }
}
