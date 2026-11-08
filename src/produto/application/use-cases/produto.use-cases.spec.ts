import { InMemoryEstoque } from '../../../test/fakes';
import { CriarProdutoUseCase } from './criar-produto.use-case';
import { BuscarProdutoUseCase } from './buscar-produto.use-case';
import { ListarProdutosUseCase } from './listar-produtos.use-case';
import { AtualizarProdutoUseCase } from './atualizar-produto.use-case';
import { RemoverProdutoUseCase } from './remover-produto.use-case';
import { RegistrarEntradaEstoqueUseCase } from './registrar-entrada-estoque.use-case';
import { ListarMovimentacoesUseCase } from './listar-movimentacoes.use-case';
import { EstoqueService } from '../services/estoque.service';
import { SkuDuplicadoError } from '../../domain/errors/sku-duplicado.error';
import { ProdutoNaoEncontradoError } from '../../domain/errors/produto-nao-encontrado.error';
import { TipoMovimentacao } from '../../domain/movimentacao-estoque';
import { DadoInvalidoError } from '../../../shared/domain/erros-de-dominio';

describe('casos de uso de Produto/Estoque', () => {
  let estoque: InMemoryEstoque;
  beforeEach(() => (estoque = new InMemoryEstoque()));

  it('CRUD com SKU unico', async () => {
    const criar = new CriarProdutoUseCase(estoque);
    const b = await criar.execute({ nome: 'B', sku: 'b-1', preco: 2, quantidadeEstoque: 3 });
    const a = await criar.execute({ nome: 'A', sku: 'a-1', preco: 1 });
    await expect(criar.execute({ nome: 'X', sku: 'B-1', preco: 1 })).rejects.toThrow(
      SkuDuplicadoError,
    );
    expect((await new ListarProdutosUseCase(estoque).execute()).map((p) => p.nome)).toEqual([
      'A',
      'B',
    ]);

    const atualizar = new AtualizarProdutoUseCase(estoque);
    await expect(atualizar.execute({ produtoId: a.produtoId, sku: 'b-1' })).rejects.toThrow(
      SkuDuplicadoError,
    );
    const atualizado = await atualizar.execute({ produtoId: b.produtoId, sku: 'b-1', preco: 9 });
    expect(atualizado.toJSON()).toMatchObject({ preco: 9, quantidadeEstoque: 3 });
    await expect(atualizar.execute({ produtoId: 'x', nome: 'n' })).rejects.toThrow(
      ProdutoNaoEncontradoError,
    );

    const buscar = new BuscarProdutoUseCase(estoque);
    expect((await buscar.execute({ produtoId: a.produtoId })).sku).toBe('A-1');
    const remover = new RemoverProdutoUseCase(estoque);
    await remover.execute({ produtoId: a.produtoId });
    await expect(buscar.execute({ produtoId: a.produtoId })).rejects.toThrow(
      ProdutoNaoEncontradoError,
    );
    await expect(remover.execute({ produtoId: a.produtoId })).rejects.toThrow(
      ProdutoNaoEncontradoError,
    );
  });

  it('entrada de estoque e auditada; historico por produto e por OS', async () => {
    const p = await new CriarProdutoUseCase(estoque).execute({ nome: 'A', sku: 'a', preco: 1 });
    const entrada = new RegistrarEntradaEstoqueUseCase(estoque, estoque);
    expect(
      (await entrada.execute({ produtoId: p.produtoId, quantidade: 4 })).quantidadeEstoque,
    ).toBe(4);
    await expect(entrada.execute({ produtoId: p.produtoId, quantidade: 0 })).rejects.toThrow(
      DadoInvalidoError,
    );
    await expect(entrada.execute({ produtoId: 'x', quantidade: 1 })).rejects.toThrow(
      ProdutoNaoEncontradoError,
    );

    const servico = new EstoqueService(estoque, estoque);
    expect(await servico.baixarParaOs('OS-1', [])).toEqual([]);
    await servico.baixarParaOs('OS-1', [{ produtoId: p.produtoId, servicoId: 's', quantidade: 1 }]);
    const listar = new ListarMovimentacoesUseCase(estoque);
    expect((await listar.execute({ produtoId: p.produtoId })).map((m) => m.tipo)).toEqual([
      TipoMovimentacao.ENTRADA,
      TipoMovimentacao.BAIXA,
    ]);
    expect(await listar.execute({ osId: 'OS-1' })).toHaveLength(1);
    expect(await servico.devolverDaOs('OS-2')).toEqual([]);
  });
});
