import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Servico } from '../../domain/servico.entity';
import { SERVICO_REPOSITORY, ServicoRepository } from '../../domain/servico.repository';
import { ServicoNaoEncontradoError } from '../../domain/errors/servico-nao-encontrado.error';

@Injectable()
export class BuscarServicoUseCase implements UseCase<{ servicoId: string }, Servico> {
  constructor(@Inject(SERVICO_REPOSITORY) private readonly repo: ServicoRepository) {}

  async execute({ servicoId }: { servicoId: string }): Promise<Servico> {
    const servico = await this.repo.buscarPorId(servicoId);
    if (!servico) throw new ServicoNaoEncontradoError(servicoId);
    return servico;
  }
}
