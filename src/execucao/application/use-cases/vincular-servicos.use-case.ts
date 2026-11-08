import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import { EXECUCAO_REPOSITORY, ExecucaoRepository } from '../../domain/execucao.repository';
import { SERVICO_REPOSITORY, ServicoRepository } from '../../../servico/domain/servico.repository';
import { ServicoNaoEncontradoError } from '../../../servico/domain/errors/servico-nao-encontrado.error';
import { carregarExecucao, exigirResponsavel } from '../execucao.helpers';

export interface VincularServicosInput {
  osId: string;
  servicoIds: string[];
  ator?: AuthenticatedUser;
}

/** Vincula N servicos do catalogo a OS (snapshot de nome/preco). Ja vinculados sao ignorados. */
@Injectable()
export class VincularServicosUseCase implements UseCase<VincularServicosInput, Execucao> {
  constructor(
    @Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository,
    @Inject(SERVICO_REPOSITORY) private readonly servicos: ServicoRepository,
  ) {}

  async execute({ osId, servicoIds, ator }: VincularServicosInput): Promise<Execucao> {
    const execucao = await carregarExecucao(this.repo, osId);
    exigirResponsavel(execucao, ator);
    for (const servicoId of new Set(servicoIds)) {
      const servico = await this.servicos.buscarPorId(servicoId);
      if (!servico) throw new ServicoNaoEncontradoError(servicoId);
      execucao.adicionarServico({ servicoId, nome: servico.nome, preco: servico.precoBase });
    }
    await this.repo.salvar(execucao);
    return execucao;
  }
}
