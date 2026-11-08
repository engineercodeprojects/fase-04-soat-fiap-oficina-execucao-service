import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Execucao } from '../../domain/execucao.entity';
import { MovimentacaoEstoque } from '../../../produto/domain/movimentacao-estoque';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { EstoqueService } from '../../../produto/application/services/estoque.service';
import { carregarExecucao } from '../execucao.helpers';

export interface RollbackExecucaoOutput {
  execucao: Execucao;
  devolucoes: MovimentacaoEstoque[];
}

/**
 * Orcamento reprovado (chamado pelo OS Service): marca CANCELADA e devolve ao
 * estoque, numa transacao, tudo o que foi baixado para a OS. Idempotente —
 * repetir (retry do OS Service) nao devolve em dobro, pois a devolucao e
 * calculada pelo liquido do historico de movimentacoes da OS.
 */
@Injectable()
export class RollbackExecucaoUseCase implements UseCase<{ osId: string }, RollbackExecucaoOutput> {
  constructor(
    @Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository,
    private readonly estoque: EstoqueService,
  ) {}

  async execute({ osId }: { osId: string }): Promise<RollbackExecucaoOutput> {
    const execucao = await carregarExecucao(this.repo, osId);
    if (execucao.cancelar()) await this.repo.salvar(execucao);
    const devolucoes = await this.estoque.devolverDaOs(osId);
    return { execucao, devolucoes };
  }
}
