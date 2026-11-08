import { Execucao } from './execucao.entity';
import { StatusExecucao as S } from './status-execucao';
import { TransicaoDeStatusInvalidaError } from './errors/transicao-invalida.error';
import { ConflitoDeNegocioError, DadoInvalidoError } from '../../shared/domain/erros-de-dominio';

const peca = (produtoId: string, quantidade: number, precoUnitario = 10) => ({
  produtoId,
  nome: produtoId,
  sku: produtoId.toUpperCase(),
  precoUnitario,
  quantidade,
});

function comServicos(): Execucao {
  const e = Execucao.atribuir('OS-1', 'mec-1', new Date('2026-01-01T00:00:00Z'));
  e.adicionarServico({ servicoId: 's1', nome: 'Troca de oleo', preco: 100 });
  e.adicionarServico({ servicoId: 's2', nome: 'Revisao', preco: 50 });
  e.vincularProduto('s1', peca('p1', 2));
  e.vincularProduto('s2', peca('p1', 1));
  e.vincularProduto('s2', peca('p2', 3, 5.5));
  return e;
}

describe('Execucao', () => {
  it('nasce ATRIBUIDA com o mecanico, sem servicos e versao 0', () => {
    const e = Execucao.atribuir('OS-1', 'mec-1');
    expect(e.status).toBe(S.ATRIBUIDA);
    expect(e.mecanicoId).toBe('mec-1');
    expect(e.servicos).toEqual([]);
    expect(e.versao).toBe(0);
  });

  it('exige osId e mecanicoId', () => {
    expect(() => Execucao.atribuir(' ', 'm')).toThrow(DadoInvalidoError);
    expect(() => Execucao.atribuir('OS', '')).toThrow(DadoInvalidoError);
  });

  it('vincula servicos (sem duplicar) e o mesmo produto a varios servicos', () => {
    const e = comServicos();
    expect(e.adicionarServico({ servicoId: 's1', nome: 'x', preco: 1 })).toBe(false);
    expect(e.servicos).toHaveLength(2);
    e.vincularProduto('s1', peca('p1', 1));
    expect(e.servicos[0].produtos).toEqual([peca('p1', 3)]);
    expect(e.itensDeEstoque()).toEqual([
      { produtoId: 'p1', servicoId: 's1', quantidade: 3 },
      { produtoId: 'p1', servicoId: 's2', quantidade: 1 },
      { produtoId: 'p2', servicoId: 's2', quantidade: 3 },
    ]);
  });

  it('calcula o valor total (mao de obra + pecas)', () => {
    expect(comServicos().valorTotal).toBe(100 + 50 + 3 * 10 + 3 * 5.5);
  });

  it('rejeita peca em servico nao vinculado e quantidade invalida', () => {
    const e = comServicos();
    expect(() => e.vincularProduto('sX', peca('p1', 1))).toThrow(DadoInvalidoError);
    expect(() => e.vincularProduto('s1', peca('p1', 0))).toThrow(DadoInvalidoError);
  });

  it('remove servico durante o diagnostico', () => {
    const e = comServicos();
    e.removerServico('s2');
    expect(e.servicos.map((s) => s.servicoId)).toEqual(['s1']);
    expect(() => e.removerServico('s2')).toThrow(DadoInvalidoError);
  });

  it('fecha o diagnostico: AGUARDANDO_APROVACAO e devolve itens a baixar', () => {
    const e = comServicos();
    const itens = e.fecharDiagnostico();
    expect(e.status).toBe(S.AGUARDANDO_APROVACAO);
    expect(itens).toHaveLength(3);
    expect(e.toJSON().estoqueBaixado).toBe(true);
  });

  it('nao fecha diagnostico sem servicos', () => {
    expect(() => Execucao.atribuir('OS', 'm').fecharDiagnostico()).toThrow(DadoInvalidoError);
  });

  it('apos fechar, servicos/pecas/mecanico ficam bloqueados', () => {
    const e = comServicos();
    e.fecharDiagnostico();
    expect(() => e.adicionarServico({ servicoId: 's3', nome: 'x', preco: 1 })).toThrow(
      ConflitoDeNegocioError,
    );
    expect(() => e.vincularProduto('s1', peca('p1', 1))).toThrow(ConflitoDeNegocioError);
    expect(() => e.removerServico('s1')).toThrow(ConflitoDeNegocioError);
    expect(() => e.reatribuirMecanico('mec-2')).toThrow(ConflitoDeNegocioError);
  });

  it('reatribui mecanico durante o diagnostico', () => {
    const e = comServicos();
    e.reatribuirMecanico('mec-2');
    expect(e.mecanicoId).toBe('mec-2');
  });

  it('fluxo feliz ate EXECUTADA', () => {
    const e = comServicos();
    e.transitarPara(S.EM_DIAGNOSTICO);
    e.fecharDiagnostico();
    e.transitarPara(S.EM_EXECUCAO);
    e.transitarPara(S.EXECUTADA);
    expect(e.status).toBe(S.EXECUTADA);
  });

  it('transicao invalida lanca TransicaoDeStatusInvalidaError', () => {
    const e = comServicos();
    expect(() => e.transitarPara(S.EXECUTADA)).toThrow(TransicaoDeStatusInvalidaError);
  });

  it('cancela (rollback) de forma idempotente', () => {
    const e = comServicos();
    e.fecharDiagnostico();
    expect(e.cancelar()).toBe(true);
    expect(e.status).toBe(S.CANCELADA);
    expect(e.toJSON().estoqueBaixado).toBe(false);
    expect(e.cancelar()).toBe(false);
  });

  it('nao cancela depois de iniciada a execucao', () => {
    const e = comServicos();
    e.fecharDiagnostico();
    e.transitarPara(S.EM_EXECUCAO);
    expect(() => e.cancelar()).toThrow(TransicaoDeStatusInvalidaError);
  });

  it('reconstituir/toJSON nao compartilham referencias', () => {
    const e = comServicos();
    const json = e.toJSON();
    json.servicos[0].produtos[0].quantidade = 999;
    expect(e.servicos[0].produtos[0].quantidade).toBe(2);
    expect(Execucao.reconstituir(e.toJSON()).valorTotal).toBe(e.valorTotal);
  });
});
