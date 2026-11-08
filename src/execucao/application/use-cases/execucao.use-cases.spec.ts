import { AuthenticatedUser, Role } from '@guilhermeqmaia/oficina-kit/auth';
import { NotOwnedByUserError } from '@guilhermeqmaia/oficina-kit/core';
import {
  FakeOsGateway,
  InMemoryEstoque,
  InMemoryExecucaoRepository,
  InMemoryServicoRepository,
} from '../../../test/fakes';
import { Produto } from '../../../produto/domain/produto.entity';
import { Servico } from '../../../servico/domain/servico.entity';
import { EstoqueService } from '../../../produto/application/services/estoque.service';
import { TipoMovimentacao } from '../../../produto/domain/movimentacao-estoque';
import { EstoqueInsuficienteError } from '../../../produto/domain/errors/estoque-insuficiente.error';
import { ProdutoNaoEncontradoError } from '../../../produto/domain/errors/produto-nao-encontrado.error';
import { ServicoNaoEncontradoError } from '../../../servico/domain/errors/servico-nao-encontrado.error';
import { StatusExecucao as S } from '../../domain/status-execucao';
import { ExecucaoNaoEncontradaError } from '../../domain/errors/execucao-nao-encontrada.error';
import { TransicaoDeStatusInvalidaError } from '../../domain/errors/transicao-invalida.error';
import { DadoInvalidoError } from '../../../shared/domain/erros-de-dominio';
import { OsServiceIndisponivelError } from '../ports/os-service.gateway';
import { AtribuirMecanicoUseCase } from './atribuir-mecanico.use-case';
import { AtualizarStatusExecucaoUseCase } from './atualizar-status-execucao.use-case';
import { VincularServicosUseCase } from './vincular-servicos.use-case';
import { VincularProdutosUseCase } from './vincular-produtos.use-case';
import { RemoverServicoDaExecucaoUseCase } from './remover-servico-da-execucao.use-case';
import { FecharDiagnosticoUseCase } from './fechar-diagnostico.use-case';
import { RollbackExecucaoUseCase } from './rollback-execucao.use-case';
import { BuscarExecucaoUseCase } from './buscar-execucao.use-case';
import { ListarExecucoesUseCase } from './listar-execucoes.use-case';

const mecanico = (id: string) => new AuthenticatedUser(id, id, null, Role.MECANICO);

describe('casos de uso de Execucao', () => {
  let repo: InMemoryExecucaoRepository;
  let os: FakeOsGateway;
  let estoque: InMemoryEstoque;
  let servicos: InMemoryServicoRepository;
  let estoqueService: EstoqueService;
  let atribuir: AtribuirMecanicoUseCase;
  let status: AtualizarStatusExecucaoUseCase;
  let vincularServicos: VincularServicosUseCase;
  let vincularProdutos: VincularProdutosUseCase;
  let fechar: FecharDiagnosticoUseCase;
  let rollback: RollbackExecucaoUseCase;

  beforeEach(async () => {
    repo = new InMemoryExecucaoRepository();
    os = new FakeOsGateway();
    estoque = new InMemoryEstoque();
    servicos = new InMemoryServicoRepository();
    estoqueService = new EstoqueService(estoque, estoque);
    atribuir = new AtribuirMecanicoUseCase(repo, os);
    status = new AtualizarStatusExecucaoUseCase(repo, os);
    vincularServicos = new VincularServicosUseCase(repo, servicos);
    vincularProdutos = new VincularProdutosUseCase(repo, estoque);
    fechar = new FecharDiagnosticoUseCase(repo, os, estoqueService);
    rollback = new RollbackExecucaoUseCase(repo, estoqueService);
    await servicos.salvar(
      Servico.criar({ servicoId: 's1', nome: 'Troca de oleo', precoBase: 100 }),
    );
    await servicos.salvar(Servico.criar({ servicoId: 's2', nome: 'Revisao', precoBase: 50 }));
    await estoque.criar(
      Produto.criar({ produtoId: 'p1', nome: 'Oleo', sku: 'OL', preco: 30, quantidadeEstoque: 5 }),
    );
    await estoque.criar(
      Produto.criar({
        produtoId: 'p2',
        nome: 'Filtro',
        sku: 'FL',
        preco: 20,
        quantidadeEstoque: 1,
      }),
    );
  });

  async function prepararDiagnostico(p1s1 = 2, p1s2 = 1) {
    await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
    await vincularServicos.execute({ osId: 'OS-1', servicoIds: ['s1', 's2', 's1'] });
    await vincularProdutos.execute({
      osId: 'OS-1',
      servicoId: 's1',
      produtos: [{ produtoId: 'p1', quantidade: p1s1 }],
    });
    await vincularProdutos.execute({
      osId: 'OS-1',
      servicoId: 's2',
      produtos: [
        { produtoId: 'p1', quantidade: p1s2 },
        { produtoId: 'p2', quantidade: 1 },
      ],
    });
  }

  describe('atribuir mecanico', () => {
    it('cria a execucao e propaga ao OS Service', async () => {
      const e = await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
      expect(e.status).toBe(S.ATRIBUIDA);
      expect(repo.itens.get('OS-1')?.mecanicoId).toBe('mec-1');
      expect(os.chamadas).toEqual([{ tipo: 'mecanico', osId: 'OS-1', valor: 'mec-1' }]);
    });

    it('e idempotente com o mesmo mecanico e reatribui outro', async () => {
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
      const e = await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-2' });
      expect(e.mecanicoId).toBe('mec-2');
      expect(repo.itens.get('OS-1')?.versao).toBe(2);
      expect(os.chamadas).toHaveLength(3);
    });

    it('desfaz a criacao se o OS Service falhar', async () => {
      os.falha = new OsServiceIndisponivelError('fora');
      await expect(atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' })).rejects.toThrow('fora');
      expect(repo.itens.has('OS-1')).toBe(false);
    });

    it('restaura o mecanico anterior se a reatribuicao falhar no OS', async () => {
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
      os.falha = new OsServiceIndisponivelError('fora');
      await expect(atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-2' })).rejects.toThrow();
      expect(repo.itens.get('OS-1')?.mecanicoId).toBe('mec-1');
    });
  });

  describe('vinculos', () => {
    it('vincula servicos (snapshot) e pecas; um produto atende varios servicos', async () => {
      await prepararDiagnostico();
      const e = await new BuscarExecucaoUseCase(repo).execute({ osId: 'OS-1' });
      expect(e.servicos.map((s) => [s.servicoId, s.nome, s.preco])).toEqual([
        ['s1', 'Troca de oleo', 100],
        ['s2', 'Revisao', 50],
      ]);
      expect(e.itensDeEstoque()).toHaveLength(3);
      expect(e.valorTotal).toBe(100 + 50 + 3 * 30 + 20);
    });

    it('erros: servico/produto/execucao inexistentes', async () => {
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
      await expect(vincularServicos.execute({ osId: 'OS-1', servicoIds: ['sX'] })).rejects.toThrow(
        ServicoNaoEncontradoError,
      );
      await vincularServicos.execute({ osId: 'OS-1', servicoIds: ['s1'] });
      await expect(
        vincularProdutos.execute({
          osId: 'OS-1',
          servicoId: 's1',
          produtos: [{ produtoId: 'pX', quantidade: 1 }],
        }),
      ).rejects.toThrow(ProdutoNaoEncontradoError);
      await expect(vincularServicos.execute({ osId: 'OS-9', servicoIds: ['s1'] })).rejects.toThrow(
        ExecucaoNaoEncontradaError,
      );
    });

    it('remove servico da execucao', async () => {
      await prepararDiagnostico();
      const e = await new RemoverServicoDaExecucaoUseCase(repo).execute({
        osId: 'OS-1',
        servicoId: 's2',
      });
      expect(e.servicos.map((s) => s.servicoId)).toEqual(['s1']);
    });

    it('MECANICO so altera a propria execucao', async () => {
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
      await expect(
        vincularServicos.execute({ osId: 'OS-1', servicoIds: ['s1'], ator: mecanico('mec-2') }),
      ).rejects.toThrow(NotOwnedByUserError);
      await expect(
        vincularServicos.execute({ osId: 'OS-1', servicoIds: ['s1'], ator: mecanico('mec-1') }),
      ).resolves.toBeDefined();
    });
  });

  describe('fechar diagnostico (baixa)', () => {
    it('baixa as pecas, registra movimentacoes e propaga AGUARDANDO_APROVACAO', async () => {
      await prepararDiagnostico();
      const e = await fechar.execute({ osId: 'OS-1' });
      expect(e.status).toBe(S.AGUARDANDO_APROVACAO);
      expect(estoque.saldo('p1')).toBe(2);
      expect(estoque.saldo('p2')).toBe(0);
      expect(
        estoque.movimentacoes.map((m) => [m.tipo, m.produtoId, m.servicoId, m.quantidade]),
      ).toEqual([
        [TipoMovimentacao.BAIXA, 'p1', 's1', 2],
        [TipoMovimentacao.BAIXA, 'p1', 's2', 1],
        [TipoMovimentacao.BAIXA, 'p2', 's2', 1],
      ]);
      expect(os.chamadas[os.chamadas.length - 1]).toEqual({
        tipo: 'status',
        osId: 'OS-1',
        valor: S.AGUARDANDO_APROVACAO,
      });
    });

    it('saldo insuficiente: nada baixa e o status volta ao anterior', async () => {
      await prepararDiagnostico(4, 2);
      await expect(fechar.execute({ osId: 'OS-1' })).rejects.toThrow(EstoqueInsuficienteError);
      expect(estoque.saldo('p1')).toBe(5);
      expect(estoque.movimentacoes).toEqual([]);
      expect(repo.itens.get('OS-1')?.status).toBe(S.ATRIBUIDA);
      expect(os.chamadas.filter((c) => c.tipo === 'status')).toEqual([]);
    });

    it('falha concorrente na transacao (condicao do banco) tambem restaura o status', async () => {
      await prepararDiagnostico();
      estoque.falharProximaAplicacao = new EstoqueInsuficienteError([
        { produtoId: 'p1', solicitado: 3, disponivel: null },
      ]);
      await expect(fechar.execute({ osId: 'OS-1' })).rejects.toThrow(EstoqueInsuficienteError);
      expect(repo.itens.get('OS-1')?.status).toBe(S.ATRIBUIDA);
    });

    it('OS Service fora: devolve as pecas e restaura o status', async () => {
      await prepararDiagnostico();
      os.falha = new OsServiceIndisponivelError('fora');
      await expect(fechar.execute({ osId: 'OS-1' })).rejects.toThrow(OsServiceIndisponivelError);
      expect(estoque.saldo('p1')).toBe(5);
      expect(estoque.saldo('p2')).toBe(1);
      expect(
        estoque.movimentacoes.filter((m) => m.tipo === TipoMovimentacao.DEVOLUCAO),
      ).toHaveLength(3);
      expect(repo.itens.get('OS-1')).toMatchObject({ status: S.ATRIBUIDA, estoqueBaixado: false });
    });

    it('nao fecha duas vezes (sem baixa em dobro)', async () => {
      await prepararDiagnostico();
      await fechar.execute({ osId: 'OS-1' });
      await expect(fechar.execute({ osId: 'OS-1' })).rejects.toThrow(
        TransicaoDeStatusInvalidaError,
      );
      expect(estoque.saldo('p1')).toBe(2);
    });
  });

  describe('rollback (orcamento reprovado)', () => {
    it('devolve tudo, marca CANCELADA e e idempotente', async () => {
      await prepararDiagnostico();
      await fechar.execute({ osId: 'OS-1' });
      const r1 = await rollback.execute({ osId: 'OS-1' });
      expect(r1.execucao.status).toBe(S.CANCELADA);
      expect(r1.devolucoes).toHaveLength(3);
      expect(estoque.saldo('p1')).toBe(5);
      expect(estoque.saldo('p2')).toBe(1);
      const r2 = await rollback.execute({ osId: 'OS-1' });
      expect(r2.devolucoes).toEqual([]);
      expect(estoque.saldo('p1')).toBe(5);
    });

    it('sem baixa previa so cancela', async () => {
      await prepararDiagnostico();
      const r = await rollback.execute({ osId: 'OS-1' });
      expect(r.execucao.status).toBe(S.CANCELADA);
      expect(r.devolucoes).toEqual([]);
    });

    it('execucao inexistente -> 404', async () => {
      await expect(rollback.execute({ osId: 'OS-X' })).rejects.toThrow(ExecucaoNaoEncontradaError);
    });
  });

  describe('status / executar / concluir', () => {
    it('EM_DIAGNOSTICO -> ... -> EXECUTADA propagando cada passo', async () => {
      await prepararDiagnostico();
      await status.execute({ osId: 'OS-1', status: S.EM_DIAGNOSTICO });
      await fechar.execute({ osId: 'OS-1' });
      await status.execute({ osId: 'OS-1', status: S.EM_EXECUCAO, ator: mecanico('mec-1') });
      const e = await status.execute({ osId: 'OS-1', status: S.EXECUTADA });
      expect(e.status).toBe(S.EXECUTADA);
      expect(os.chamadas.filter((c) => c.tipo === 'status').map((c) => c.valor)).toEqual([
        S.EM_DIAGNOSTICO,
        S.AGUARDANDO_APROVACAO,
        S.EM_EXECUCAO,
        S.EXECUTADA,
      ]);
      expect(() => rollback.execute({ osId: 'OS-1' })).rejects.toThrow(
        TransicaoDeStatusInvalidaError,
      );
    });

    it('rejeita status com efeito em estoque e transicoes invalidas', async () => {
      await prepararDiagnostico();
      await expect(status.execute({ osId: 'OS-1', status: S.CANCELADA })).rejects.toThrow(
        DadoInvalidoError,
      );
      await expect(
        status.execute({ osId: 'OS-1', status: S.AGUARDANDO_APROVACAO }),
      ).rejects.toThrow(DadoInvalidoError);
      await expect(status.execute({ osId: 'OS-1', status: S.EM_EXECUCAO })).rejects.toThrow(
        TransicaoDeStatusInvalidaError,
      );
    });

    it('OS Service fora: status local revertido', async () => {
      await prepararDiagnostico();
      await fechar.execute({ osId: 'OS-1' });
      os.falha = new OsServiceIndisponivelError('fora');
      await expect(status.execute({ osId: 'OS-1', status: S.EM_EXECUCAO })).rejects.toThrow();
      expect(repo.itens.get('OS-1')?.status).toBe(S.AGUARDANDO_APROVACAO);
    });
  });

  it('listar: MECANICO ve so as suas; ADMIN filtra por status', async () => {
    await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
    await atribuir.execute({ osId: 'OS-2', mecanicoId: 'mec-2' });
    const listar = new ListarExecucoesUseCase(repo);
    expect((await listar.execute({ ator: mecanico('mec-2') })).map((e) => e.osId)).toEqual([
      'OS-2',
    ]);
    expect(await listar.execute({ status: S.EXECUTADA })).toEqual([]);
    expect(await listar.execute({})).toHaveLength(2);
  });
});
