import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { Servico } from '../../domain/servico.entity';
import { SERVICO_REPOSITORY, ServicoRepository } from '../../domain/servico.repository';

export interface CriarServicoInput {
  nome: string;
  descricao?: string;
  precoBase: number;
}

@Injectable()
export class CriarServicoUseCase implements UseCase<CriarServicoInput, Servico> {
  constructor(@Inject(SERVICO_REPOSITORY) private readonly repo: ServicoRepository) {}

  async execute(input: CriarServicoInput): Promise<Servico> {
    const servico = Servico.criar({ servicoId: randomUUID(), ...input });
    await this.repo.salvar(servico);
    return servico;
  }
}
