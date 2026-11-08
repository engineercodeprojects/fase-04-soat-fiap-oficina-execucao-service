import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { SERVICO_REPOSITORY, ServicoRepository } from '../../domain/servico.repository';
import { ServicoNaoEncontradoError } from '../../domain/errors/servico-nao-encontrado.error';

/** Remove do catalogo. Execucoes ja vinculadas guardam nome/preco congelados e nao sao afetadas. */
@Injectable()
export class RemoverServicoUseCase implements UseCase<{ servicoId: string }, void> {
  constructor(@Inject(SERVICO_REPOSITORY) private readonly repo: ServicoRepository) {}

  async execute({ servicoId }: { servicoId: string }): Promise<void> {
    const servico = await this.repo.buscarPorId(servicoId);
    if (!servico) throw new ServicoNaoEncontradoError(servicoId);
    await this.repo.remover(servicoId);
  }
}
