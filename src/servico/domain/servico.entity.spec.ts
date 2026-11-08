import { Servico } from './servico.entity';
import { DadoInvalidoError } from '../../shared/domain/erros-de-dominio';

describe('Servico', () => {
  it('cria normalizado e atualiza parcialmente', () => {
    const s = Servico.criar({
      servicoId: 's1',
      nome: ' Alinhamento ',
      descricao: ' ',
      precoBase: 80,
    });
    expect(s.toJSON()).toMatchObject({ nome: 'Alinhamento', descricao: null, precoBase: 80 });
    s.atualizar({ descricao: 'Dianteiro', precoBase: 90.555 });
    expect(s.toJSON()).toMatchObject({
      nome: 'Alinhamento',
      descricao: 'Dianteiro',
      precoBase: 90.56,
    });
    s.atualizar({ nome: 'Alinhamento 3D', descricao: '' });
    expect(s.toJSON()).toMatchObject({ nome: 'Alinhamento 3D', descricao: null });
    expect(Servico.reconstituir(s.toJSON()).precoBase).toBe(90.56);
  });

  it('valida nome e preco', () => {
    expect(() => Servico.criar({ servicoId: 's', nome: '', precoBase: 1 })).toThrow(
      DadoInvalidoError,
    );
    expect(() => Servico.criar({ servicoId: 's', nome: 'a', precoBase: NaN })).toThrow(
      DadoInvalidoError,
    );
  });
});
