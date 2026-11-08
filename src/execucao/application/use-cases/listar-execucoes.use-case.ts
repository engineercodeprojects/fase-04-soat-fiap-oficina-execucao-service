import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@guilhermeqmaia/oficina-kit/core';
import { AuthenticatedUser, Role } from '@guilhermeqmaia/oficina-kit/auth';
import { Execucao } from '../../domain/execucao.entity';
import { StatusExecucao } from '../../domain/status-execucao';
import {
  EXECUCAO_REPOSITORY,
  ExecucaoRepository,
  FiltroExecucoes,
} from '../../domain/execucao.repository';

/** Fila de execucoes. MECANICO ve as atribuidas a ele e as NA_FILA (para assumir). */
@Injectable()
export class ListarExecucoesUseCase implements UseCase<
  FiltroExecucoes & { ator?: AuthenticatedUser },
  Execucao[]
> {
  constructor(@Inject(EXECUCAO_REPOSITORY) private readonly repo: ExecucaoRepository) {}

  async execute({ ator, ...filtro }: FiltroExecucoes & { ator?: AuthenticatedUser }) {
    let lista = await this.repo.listar(
      ator?.role === Role.MECANICO ? { ...filtro, mecanicoId: undefined } : filtro,
    );
    if (ator?.role === Role.MECANICO) {
      lista = lista.filter((e) => e.mecanicoId === ator.id || e.status === StatusExecucao.NA_FILA);
    }
    return lista.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
