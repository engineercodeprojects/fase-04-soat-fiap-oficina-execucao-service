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

const naFila = () =>
  Execucao.enfileirar(
    { osId: 'OS-1', veiculoId: 'v1', descricaoProblema: ' Barulho ' },
    new Date('2026-01-01T00:00:00Z'),
  );

function comServicos(): Execucao {
  const e = naFila();
  e.atribuirMecanico('mec-1');
  e.adicionarServico({ servicoId: 's1', nome: 'Troca de oleo', preco: 100 });
  e.adicionarServico({ servicoId: 's2', nome: 'Revisao', preco: 50 });
  e.vincularProduto('s1', peca('p1', 2));
  e.vincularProduto('s2', peca('p1', 1));
  e.vincularProduto('s2', peca('p2', 3, 5.5));
  return e;
}

describe('Execucao', () => {
  it('nasce NA_FILA, sem mecanico, versao 0', () => {
    const e = naFila();
    expect(e.toJSON()).toMatchObject({
      osId: 'OS-1',
      veiculoId: 'v1',
      descricaoProblema: 'Barulho',
      mecanicoId: null,
      status: S.NA_FILA,
      servicos: [],
      versao: 0,
    });
    expect(e.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('exige numeroOS e veiculoId', () => {
    expect(() => Execucao.enfileirar({ osId: ' ', veiculoId: 'v' })).toThrow(DadoInvalidoError);
    expect(() => Execucao.enfileirar({ osId: 'OS', veiculoId: '' })).toThrow(DadoInvalidoError);
    expect(
      Execucao.enfileirar({ osId: 'OS', veiculoId: 'v' }).toJSON().descricaoProblema,
    ).toBeNull();
  });

  it('atribuir tira da fila; reatribui durante o diagnostico', () => {
    const e = naFila();
    e.atribuirMecanico('mec-1');
    expect([e.status, e.mecanicoId]).toEqual([S.ATRIBUIDA, 'mec-1']);
    e.atribuirMecanico('mec-2');
    expect(e.mecanicoId).toBe('mec-2');
    expect(() => e.atribuirMecanico('')).toThrow(DadoInvalidoError);
  });

  it('nao vincula servico antes de atribuir; primeiro servico inicia o diagnostico', () => {
    const e = naFila();
    expect(() => e.adicionarServico({ servicoId: 's', nome: 'x', preco: 1 })).toThrow(
      ConflitoDeNegocioError,
    );
    e.atribuirMecanico('m');
    e.adicionarServico({ servicoId: 's', nome: 'x', preco: 1 });
    expect(e.status).toBe(S.EM_DIAGNOSTICO);
  });

  it('vincula servicos (sem duplicar) e o mesmo produto a varios servicos', () => {
    const e = comServicos();
    expect(e.adicionarServico({ servicoId: 's1', nome: 'x', preco: 1 })).toBe(false);
    e.vincularProduto('s1', peca('p1', 1));
    expect(e.servicos[0].produtos).toEqual([peca('p1', 3)]);
    expect(e.itensDeEstoque()).toEqual([
      { produtoId: 'p1', servicoId: 's1', quantidade: 3 },
      { produtoId: 'p1', servicoId: 's2', quantidade: 1 },
      { produtoId: 'p2', servicoId: 's2', quantidade: 3 },
    ]);
    expect(e.valorTotal).toBe(100 + 50 + 4 * 10 + 3 * 5.5);
  });

  it('itensDoDiagnostico no formato do OS Service', () => {
    expect(comServicos().itensDoDiagnostico()).toEqual([
      {
        tipo: 'SERVICO',
        referenciaId: 's1',
        nome: 'Troca de oleo',
        quantidade: 1,
        precoUnitario: '100.00',
      },
      {
        tipo: 'PRODUTO',
        referenciaId: 'p1',
        nome: 'p1',
        quantidade: 2,
        precoUnitario: '10.00',
        servicoId: 's1',
      },
      {
        tipo: 'SERVICO',
        referenciaId: 's2',
        nome: 'Revisao',
        quantidade: 1,
        precoUnitario: '50.00',
      },
      {
        tipo: 'PRODUTO',
        referenciaId: 'p1',
        nome: 'p1',
        quantidade: 1,
        precoUnitario: '10.00',
        servicoId: 's2',
      },
      {
        tipo: 'PRODUTO',
        referenciaId: 'p2',
        nome: 'p2',
        quantidade: 3,
        precoUnitario: '5.50',
        servicoId: 's2',
      },
    ]);
  });

  it('rejeita peca em servico nao vinculado e quantidade invalida; remove servico', () => {
    const e = comServicos();
    expect(() => e.vincularProduto('sX', peca('p1', 1))).toThrow(DadoInvalidoError);
    expect(() => e.vincularProduto('s1', peca('p1', 0))).toThrow(DadoInvalidoError);
    e.removerServico('s2');
    expect(e.servicos.map((s) => s.servicoId)).toEqual(['s1']);
    expect(() => e.removerServico('s2')).toThrow(DadoInvalidoError);
  });

  it('conclui o diagnostico: AGUARDANDO_APROVACAO, laudo e itens a baixar', () => {
    const e = comServicos();
    const itens = e.concluirDiagnostico(' Pastilhas gastas ');
    expect(e.status).toBe(S.AGUARDANDO_APROVACAO);
    expect(e.diagnostico).toBe('Pastilhas gastas');
    expect(itens).toHaveLength(3);
    expect(e.toJSON().estoqueBaixado).toBe(true);
  });

  it('nao conclui sem servicos ou sem laudo', () => {
    const e = naFila();
    e.atribuirMecanico('m');
    expect(() => e.concluirDiagnostico('x')).toThrow(DadoInvalidoError);
    expect(() => comServicos().concluirDiagnostico(' ')).toThrow(DadoInvalidoError);
  });

  it('apos concluir, servicos/pecas/mecanico ficam bloqueados', () => {
    const e = comServicos();
    e.concluirDiagnostico('ok');
    expect(() => e.adicionarServico({ servicoId: 's3', nome: 'x', preco: 1 })).toThrow(
      ConflitoDeNegocioError,
    );
    expect(() => e.vincularProduto('s1', peca('p1', 1))).toThrow(ConflitoDeNegocioError);
    expect(() => e.removerServico('s1')).toThrow(ConflitoDeNegocioError);
    expect(() => e.atribuirMecanico('mec-2')).toThrow(ConflitoDeNegocioError);
  });

  it('fluxo feliz ate EXECUTADA; iniciar e idempotente', () => {
    const e = comServicos();
    e.concluirDiagnostico('ok');
    expect(e.iniciarExecucao()).toBe(true);
    expect(e.iniciarExecucao()).toBe(false);
    e.finalizar(new Date('2026-02-01T00:00:00Z'));
    expect([e.status, e.finalizadaEm]).toEqual([S.EXECUTADA, '2026-02-01T00:00:00.000Z']);
    expect(e.iniciarExecucao()).toBe(false);
  });

  it('transicoes invalidas', () => {
    const e = comServicos();
    expect(() => e.iniciarExecucao()).toThrow(TransicaoDeStatusInvalidaError);
    expect(() => e.finalizar()).toThrow(TransicaoDeStatusInvalidaError);
  });

  it('cancela (liberar) de forma idempotente, inclusive na fila', () => {
    const fila = naFila();
    expect(fila.cancelar()).toBe(true);
    const e = comServicos();
    e.concluirDiagnostico('ok');
    expect(e.cancelar()).toBe(true);
    expect(e.status).toBe(S.CANCELADA);
    expect(e.toJSON().estoqueBaixado).toBe(false);
    expect(e.cancelar()).toBe(false);
  });

  it('nao cancela depois de iniciada a execucao', () => {
    const e = comServicos();
    e.concluirDiagnostico('ok');
    e.iniciarExecucao();
    expect(() => e.cancelar()).toThrow(TransicaoDeStatusInvalidaError);
  });

  it('reconstituir/toJSON nao compartilham referencias', () => {
    const e = comServicos();
    const json = e.toJSON();
    json.servicos[0].produtos[0].quantidade = 999;
    expect(e.servicos[0].produtos[0].quantidade).toBe(2);
    expect(Execucao.reconstituir(e.toJSON()).valorTotal).toBe(e.valorTotal);
    expect(e.veiculoId).toBe('v1');
  });
});
