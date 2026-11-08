import { Produto } from './produto.entity';
import { DadoInvalidoError } from '../../shared/domain/erros-de-dominio';

describe('Produto', () => {
  const novo = () =>
    Produto.criar({ produtoId: 'p1', nome: ' Filtro ', sku: 'flt-1', preco: 45.999 });

  it('normaliza nome, sku e preco; saldo inicial 0', () => {
    const p = novo();
    expect(p.toJSON()).toMatchObject({
      nome: 'Filtro',
      sku: 'FLT-1',
      preco: 46,
      quantidadeEstoque: 0,
    });
  });

  it('valida campos', () => {
    expect(() => Produto.criar({ produtoId: 'p', nome: '', sku: 'a', preco: 1 })).toThrow(
      DadoInvalidoError,
    );
    expect(() => Produto.criar({ produtoId: 'p', nome: 'a', sku: ' ', preco: 1 })).toThrow(
      DadoInvalidoError,
    );
    expect(() => Produto.criar({ produtoId: 'p', nome: 'a', sku: 'a', preco: -1 })).toThrow(
      DadoInvalidoError,
    );
    expect(() =>
      Produto.criar({ produtoId: 'p', nome: 'a', sku: 'a', preco: 1, quantidadeEstoque: -1 }),
    ).toThrow(DadoInvalidoError);
    expect(() =>
      Produto.criar({ produtoId: 'p', nome: 'a', sku: 'a', preco: 1, quantidadeEstoque: 1.5 }),
    ).toThrow(DadoInvalidoError);
  });

  it('atualiza cadastro sem mexer no saldo', () => {
    const p = Produto.reconstituir({ ...novo().toJSON(), quantidadeEstoque: 7 });
    p.atualizarCadastro({ nome: 'Novo', sku: 'x-2', preco: 10 }, new Date('2030-01-01T00:00:00Z'));
    expect(p.toJSON()).toMatchObject({ nome: 'Novo', sku: 'X-2', preco: 10, quantidadeEstoque: 7 });
    expect(p.updatedAt).toBe('2030-01-01T00:00:00.000Z');
    p.atualizarCadastro({});
    expect(p.nome).toBe('Novo');
  });

  it('possuiSaldo', () => {
    const p = Produto.reconstituir({ ...novo().toJSON(), quantidadeEstoque: 2 });
    expect(p.possuiSaldo(2)).toBe(true);
    expect(p.possuiSaldo(3)).toBe(false);
  });
});
