import { InMemoryServicoRepository } from '../../../test/fakes';
import { CriarServicoUseCase } from './criar-servico.use-case';
import { BuscarServicoUseCase } from './buscar-servico.use-case';
import { ListarServicosUseCase } from './listar-servicos.use-case';
import { AtualizarServicoUseCase } from './atualizar-servico.use-case';
import { RemoverServicoUseCase } from './remover-servico.use-case';
import { ServicoNaoEncontradoError } from '../../domain/errors/servico-nao-encontrado.error';

describe('casos de uso de Servico', () => {
  it('CRUD do catalogo', async () => {
    const repo = new InMemoryServicoRepository();
    const criar = new CriarServicoUseCase(repo);
    const b = await criar.execute({ nome: 'Balanceamento', precoBase: 60 });
    await criar.execute({ nome: 'Alinhamento', precoBase: 80 });
    expect((await new ListarServicosUseCase(repo).execute()).map((s) => s.nome)).toEqual([
      'Alinhamento',
      'Balanceamento',
    ]);
    const atualizar = new AtualizarServicoUseCase(repo);
    expect((await atualizar.execute({ servicoId: b.servicoId, precoBase: 70 })).precoBase).toBe(70);
    await expect(atualizar.execute({ servicoId: 'x' })).rejects.toThrow(ServicoNaoEncontradoError);
    const buscar = new BuscarServicoUseCase(repo);
    expect((await buscar.execute({ servicoId: b.servicoId })).precoBase).toBe(70);
    const remover = new RemoverServicoUseCase(repo);
    await remover.execute({ servicoId: b.servicoId });
    await expect(buscar.execute({ servicoId: b.servicoId })).rejects.toThrow(
      ServicoNaoEncontradoError,
    );
    await expect(remover.execute({ servicoId: b.servicoId })).rejects.toThrow(
      ServicoNaoEncontradoError,
    );
  });
});
