import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Servico } from '../../domain/servico.entity';
import { SERVICO_REPOSITORY, ServicoRepository } from '../../domain/servico.repository';
import { ServicoNaoEncontradoError } from '../../domain/errors/servico-nao-encontrado.error';

export interface AtualizarServicoInput {
  servicoId: string;
  nome?: string;
  descricao?: string;
  precoBase?: number;
}

@Injectable()
export class AtualizarServicoUseCase implements UseCase<AtualizarServicoInput, Servico> {
  constructor(@Inject(SERVICO_REPOSITORY) private readonly repo: ServicoRepository) {}

  async execute({ servicoId, ...dados }: AtualizarServicoInput): Promise<Servico> {
    const servico = await this.repo.buscarPorId(servicoId);
    if (!servico) throw new ServicoNaoEncontradoError(servicoId);
    servico.atualizar(dados);
    await this.repo.salvar(servico);
    return servico;
  }
}
