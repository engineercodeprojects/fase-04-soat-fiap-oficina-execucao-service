import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Execucao } from '../../domain/execucao.entity';
import { MovimentacaoEstoque } from '../../../produto/domain/movimentacao-estoque';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { EstoqueService } from '../../../produto/application/services/estoque.service';

export interface LiberarExecucaoOutput {
  execucao: Execucao | null;
  devolucoes: MovimentacaoEstoque[];
}

/**
 * `execucao.liberar-reservas` (OS Service — OS cancelada / orcamento
 * reprovado): marca CANCELADA (tira da fila, aborta o diagnostico) e devolve ao
 * estoque, numa transacao, tudo o que foi baixado para a OS. Idempotente e
 * `200` mesmo sem execucao/baixas: a devolucao e o liquido do historico da OS.
 */
@Injectable()
export class LiberarExecucaoUseCase implements UseCase<
  { osId: string; motivo?: string },
  LiberarExecucaoOutput
> {
  constructor(
    @Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository,
    private readonly estoque: EstoqueService,
  ) {}

  async execute({ osId }: { osId: string; motivo?: string }): Promise<LiberarExecucaoOutput> {
    const execucao = await this.repo.buscarPorOsId(osId);
    if (execucao?.cancelar()) await this.repo.salvar(execucao);
    const devolucoes = await this.estoque.devolverDaOs(osId);
    return { execucao, devolucoes };
  }
}
