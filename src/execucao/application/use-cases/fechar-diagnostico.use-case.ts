import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import { StatusExecucao } from '../../domain/status-execucao';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { EstoqueService } from '../../../produto/application/services/estoque.service';
import { OS_SERVICE_GATEWAY, OsServiceGateway } from '../ports/os-service.gateway';
import { carregarExecucao, exigirResponsavel, persistirEPropagar } from '../execucao.helpers';

/**
 * Fecha o diagnostico: consolida servicos+pecas, da BAIXA no estoque (uma
 * TransactWriteItems — tudo ou nada, sem saldo negativo) e muda a OS para
 * AGUARDANDO_APROVACAO no OS Service. Ordem e compensacao:
 * 1. grava AGUARDANDO_APROVACAO local (lock otimista impede baixa em dobro);
 * 2. baixa no estoque — falhou: volta o status;
 * 3. propaga ao OS Service — falhou: devolve as pecas e volta o status.
 */
@Injectable()
export class FecharDiagnosticoUseCase implements UseCase<
  { osId: string; ator?: AuthenticatedUser },
  Execucao
> {
  constructor(
    @Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository,
    @Inject(OS_SERVICE_GATEWAY) private readonly os: OsServiceGateway,
    private readonly estoque: EstoqueService,
  ) {}

  async execute({ osId, ator }: { osId: string; ator?: AuthenticatedUser }): Promise<Execucao> {
    const execucao = await carregarExecucao(this.repo, osId);
    exigirResponsavel(execucao, ator);
    const anterior = execucao.toJSON();
    const itens = execucao.fecharDiagnostico();
    let baixou = false;
    await persistirEPropagar(
      this.repo,
      execucao,
      anterior,
      async () => {
        await this.estoque.baixarParaOs(osId, itens);
        baixou = true;
        await this.os.atualizarStatus(osId, StatusExecucao.AGUARDANDO_APROVACAO);
      },
      async () => {
        if (baixou) await this.estoque.devolverDaOs(osId);
      },
    );
    return execucao;
  }
}
