import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser, Role } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import {
  EXECUCAO_REPOSITORY,
  ExecucaoRepository,
  FiltroExecucoes,
} from '../../domain/execucao.repository';

/** Fila de execucoes. Para MECANICO, sempre filtra pelas execucoes atribuidas a ele. */
@Injectable()
export class ListarExecucoesUseCase implements UseCase<
  FiltroExecucoes & { ator?: AuthenticatedUser },
  Execucao[]
> {
  constructor(@Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository) {}

  async execute({ ator, ...filtro }: FiltroExecucoes & { ator?: AuthenticatedUser }) {
    if (ator?.role === Role.MECANICO) filtro.mecanicoId = ator.id;
    const lista = await this.repo.listar(filtro);
    return lista.sort((a, b) => a.toJSON().createdAt.localeCompare(b.toJSON().createdAt));
  }
}
