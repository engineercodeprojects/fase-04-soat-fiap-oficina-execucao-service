import { AuthenticatedUser, Role } from '@guilhermeqmaia/oficina-kit/auth';
import { NotOwnedByUserError } from '@guilhermeqmaia/oficina-kit/core';
import { Execucao, ExecucaoProps } from '../domain/execucao.entity';
import { ExecucaoRepository } from '../domain/execucao.repository';
import { ExecucaoNaoEncontradaError } from '../domain/errors/execucao-nao-encontrada.error';

export async function carregarExecucao(repo: ExecucaoRepository, osId: string): Promise<Execucao> {
  const execucao = await repo.buscarPorOsId(osId);
  if (!execucao) throw new ExecucaoNaoEncontradaError(osId);
  return execucao;
}

/** MECANICO so opera a execucao atribuida a ele; ADMIN/SERVICO operam qualquer uma. */
export function exigirResponsavel(execucao: Execucao, ator?: AuthenticatedUser): void {
  if (ator?.role === Role.MECANICO && ator.id !== execucao.mecanicoId) {
    throw new NotOwnedByUserError('Execucao', execucao.osId);
  }
}

/**
 * Grava a mudanca local (lock otimista — "reserva" o estado e serializa
 * operacoes concorrentes) e so entao propaga para fora (estoque/OS Service).
 * Se a propagacao falhar, executa `compensar` e restaura o estado anterior,
 * relancando o erro original.
 */
export async function persistirEPropagar(
  repo: ExecucaoRepository,
  execucao: Execucao,
  anterior: ExecucaoProps,
  propagar: () => Promise<void>,
  compensar?: () => Promise<void>,
): Promise<void> {
  await repo.salvar(execucao);
  try {
    await propagar();
  } catch (erro) {
    if (compensar) await compensar();
    await restaurar(repo, execucao, anterior);
    throw erro;
  }
}

async function restaurar(
  repo: ExecucaoRepository,
  execucao: Execucao,
  anterior: ExecucaoProps,
): Promise<void> {
  if (anterior.versao === 0) {
    await repo.remover(execucao.osId, execucao.versao);
    return;
  }
  const restaurada = Execucao.reconstituir({ ...anterior, versao: execucao.versao });
  await repo.salvar(restaurada);
}
