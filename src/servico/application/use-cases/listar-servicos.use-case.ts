import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Servico } from '../../domain/servico.entity';
import { SERVICO_REPOSITORY, ServicoRepository } from '../../domain/servico.repository';

@Injectable()
export class ListarServicosUseCase implements UseCase<void, Servico[]> {
  constructor(@Inject(SERVICO_REPOSITORY) private readonly repo: ServicoRepository) {}

  async execute(): Promise<Servico[]> {
    const servicos = await this.repo.listar();
    return servicos.sort((a, b) => a.nome.localeCompare(b.nome));
  }
}
