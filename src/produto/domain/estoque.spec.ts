import { Produto } from './produto.entity';
import { TipoMovimentacao as T, deltaDoSaldo } from './movimentacao-estoque';
import { consolidarPorProduto, planejarBaixa, planejarDevolucao, validarSaldo } from './estoque';
import { EstoqueInsuficienteError } from './errors/estoque-insuficiente.error';
import { ProdutoNaoEncontradoError } from './errors/produto-nao-encontrado.error';
import { DadoInvalidoError } from '../../shared/domain/erros-de-dominio';

let seq = 0;
const id = () => `m${++seq}`;
const produto = (produtoId: string, quantidadeEstoque: number) =>
  Produto.criar({ produtoId, nome: produtoId, sku: produtoId, preco: 10, quantidadeEstoque });

describe('estoque (dominio)', () => {
  beforeEach(() => (seq = 0));

  it('deltaDoSaldo: BAIXA subtrai, ENTRADA/DEVOLUCAO somam', () => {
    expect(deltaDoSaldo({ tipo: T.BAIXA, quantidade: 2 })).toBe(-2);
    expect(deltaDoSaldo({ tipo: T.DEVOLUCAO, quantidade: 2 })).toBe(2);
    expect(deltaDoSaldo({ tipo: T.ENTRADA, quantidade: 2 })).toBe(2);
  });

  describe('validarSaldo', () => {
    const produtos = new Map([
      ['p1', produto('p1', 3)],
      ['p2', produto('p2', 0)],
    ]);

    it('aceita quando o saldo cobre a soma de todos os servicos', () => {
      expect(() =>
        validarSaldo(
          [
            { produtoId: 'p1', servicoId: 's1', quantidade: 2 },
            { produtoId: 'p1', servicoId: 's2', quantidade: 1 },
          ],
          produtos,
        ),
      ).not.toThrow();
    });

    it('rejeita quando a soma excede o saldo, listando o que falta', () => {
      try {
        validarSaldo(
          [
            { produtoId: 'p1', servicoId: 's1', quantidade: 2 },
            { produtoId: 'p1', servicoId: 's2', quantidade: 2 },
            { produtoId: 'p2', servicoId: 's2', quantidade: 1 },
          ],
          produtos,
        );
        fail('deveria lancar');
      } catch (e) {
        expect(e).toBeInstanceOf(EstoqueInsuficienteError);
        expect((e as EstoqueInsuficienteError).itens).toEqual([
          { produtoId: 'p1', solicitado: 4, disponivel: 3 },
          { produtoId: 'p2', solicitado: 1, disponivel: 0 },
        ]);
        expect((e as Error).message).toContain('p1 (solicitado 4, disponivel 3)');
      }
    });

    it('rejeita produto inexistente', () => {
      expect(() =>
        validarSaldo([{ produtoId: 'pX', servicoId: 's', quantidade: 1 }], produtos),
      ).toThrow(ProdutoNaoEncontradoError);
    });
  });

  it('mensagem sem saldo conhecido (condicao do banco)', () => {
    expect(
      new EstoqueInsuficienteError([{ produtoId: 'p', solicitado: 1, disponivel: null }]).message,
    ).toBe('Estoque insuficiente: p (solicitado 1)');
  });

  describe('planejarBaixa', () => {
    it('gera uma BAIXA por (produto, servico), agregando repetidos', () => {
      const movs = planejarBaixa(
        'OS-1',
        [
          { produtoId: 'p1', servicoId: 's1', quantidade: 1 },
          { produtoId: 'p1', servicoId: 's1', quantidade: 2 },
          { produtoId: 'p1', servicoId: 's2', quantidade: 1 },
        ],
        id,
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(movs).toEqual([
        {
          movimentacaoId: 'm1',
          produtoId: 'p1',
          tipo: T.BAIXA,
          quantidade: 3,
          osId: 'OS-1',
          servicoId: 's1',
          data: '2026-01-01T00:00:00.000Z',
        },
        {
          movimentacaoId: 'm2',
          produtoId: 'p1',
          tipo: T.BAIXA,
          quantidade: 1,
          osId: 'OS-1',
          servicoId: 's2',
          data: '2026-01-01T00:00:00.000Z',
        },
      ]);
      expect(consolidarPorProduto(movs).get('p1')).toBe(-4);
    });

    it('rejeita quantidade nao positiva', () => {
      expect(() =>
        planejarBaixa('OS', [{ produtoId: 'p', servicoId: 's', quantidade: 0 }], id),
      ).toThrow(DadoInvalidoError);
    });
  });

  describe('planejarDevolucao', () => {
    const baixas = planejarBaixa(
      'OS-1',
      [
        { produtoId: 'p1', servicoId: 's1', quantidade: 3 },
        { produtoId: 'p2', servicoId: 's1', quantidade: 1 },
      ],
      id,
    );

    it('devolve o liquido baixado por (produto, servico), ignorando outras OS e entradas', () => {
      const outra = planejarBaixa(
        'OS-2',
        [{ produtoId: 'p1', servicoId: 's1', quantidade: 9 }],
        id,
      );
      const entrada = { ...outra[0], movimentacaoId: 'e', tipo: T.ENTRADA, osId: 'OS-1' };
      const devolucoes = planejarDevolucao('OS-1', [...baixas, ...outra, entrada], id);
      expect(devolucoes.map((d) => [d.produtoId, d.servicoId, d.tipo, d.quantidade])).toEqual([
        ['p1', 's1', T.DEVOLUCAO, 3],
        ['p2', 's1', T.DEVOLUCAO, 1],
      ]);
      expect(consolidarPorProduto(devolucoes).get('p1')).toBe(3);
    });

    it('e idempotente: depois de devolver tudo nao gera nada', () => {
      const devolucoes = planejarDevolucao('OS-1', baixas, id);
      expect(planejarDevolucao('OS-1', [...baixas, ...devolucoes], id)).toEqual([]);
    });

    it('sem historico, nada a devolver', () => {
      expect(planejarDevolucao('OS-1', [], id)).toEqual([]);
    });
  });
});
