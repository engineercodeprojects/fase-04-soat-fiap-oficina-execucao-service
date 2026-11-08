import {
  StatusExecucao as S,
  TRANSICOES_PERMITIDAS,
  emDiagnostico,
  podeTransitar,
} from './status-execucao';

describe('maquina de estados da execucao', () => {
  it.each([
    [S.ATRIBUIDA, S.EM_DIAGNOSTICO],
    [S.ATRIBUIDA, S.AGUARDANDO_APROVACAO],
    [S.EM_DIAGNOSTICO, S.AGUARDANDO_APROVACAO],
    [S.AGUARDANDO_APROVACAO, S.EM_EXECUCAO],
    [S.AGUARDANDO_APROVACAO, S.CANCELADA],
    [S.EM_EXECUCAO, S.EXECUTADA],
  ])('permite %s -> %s', (de, para) => expect(podeTransitar(de, para)).toBe(true));

  it.each([
    [S.ATRIBUIDA, S.EM_EXECUCAO],
    [S.EM_DIAGNOSTICO, S.EXECUTADA],
    [S.AGUARDANDO_APROVACAO, S.EXECUTADA],
    [S.EM_EXECUCAO, S.CANCELADA],
    [S.EXECUTADA, S.EM_EXECUCAO],
    [S.CANCELADA, S.ATRIBUIDA],
  ])('bloqueia %s -> %s', (de, para) => expect(podeTransitar(de, para)).toBe(false));

  it('EXECUTADA e CANCELADA sao finais', () => {
    expect(TRANSICOES_PERMITIDAS[S.EXECUTADA]).toEqual([]);
    expect(TRANSICOES_PERMITIDAS[S.CANCELADA]).toEqual([]);
  });

  it('diagnostico aberto so em ATRIBUIDA/EM_DIAGNOSTICO', () => {
    expect(Object.values(S).filter(emDiagnostico)).toEqual([S.ATRIBUIDA, S.EM_DIAGNOSTICO]);
  });
});
