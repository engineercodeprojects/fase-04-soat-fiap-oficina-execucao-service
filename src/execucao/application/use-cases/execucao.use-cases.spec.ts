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
import { ConflitoDeNegocioError } from '../../../shared/domain/erros-de-dominio';
import { OsServiceIndisponivelError } from '../ports/os-service.gateway';
import { EnfileirarExecucaoUseCase } from './enfileirar-execucao.use-case';
import { AtribuirMecanicoUseCase } from './atribuir-mecanico.use-case';
import { VincularServicosUseCase } from './vincular-servicos.use-case';
import { VincularProdutosUseCase } from './vincular-produtos.use-case';
import { RemoverServicoDaExecucaoUseCase } from './remover-servico-da-execucao.use-case';
import { ConcluirDiagnosticoUseCase } from './concluir-diagnostico.use-case';
import { IniciarExecucaoUseCase } from './iniciar-execucao.use-case';
import { FinalizarExecucaoUseCase } from './finalizar-execucao.use-case';
import { LiberarExecucaoUseCase } from './liberar-execucao.use-case';
import { BuscarExecucaoUseCase } from './buscar-execucao.use-case';
import { ListarExecucoesUseCase } from './listar-execucoes.use-case';

const mecanico = (id: string) => new AuthenticatedUser(id, id, null, Role.MECANICO);

describe('casos de uso de Execucao', () => {
  let repo: InMemoryExecucaoRepository;
  let os: FakeOsGateway;
  let estoque: InMemoryEstoque;
  let servicos: InMemoryServicoRepository;
  let enfileirar: EnfileirarExecucaoUseCase;
  let atribuir: AtribuirMecanicoUseCase;
  let vincularServicos: VincularServicosUseCase;
  let vincularProdutos: VincularProdutosUseCase;
  let concluir: ConcluirDiagnosticoUseCase;
  let iniciar: IniciarExecucaoUseCase;
  let finalizar: FinalizarExecucaoUseCase;
  let liberar: LiberarExecucaoUseCase;

  beforeEach(async () => {
    repo = new InMemoryExecucaoRepository();
    os = new FakeOsGateway();
    estoque = new InMemoryEstoque();
    servicos = new InMemoryServicoRepository();
    const estoqueService = new EstoqueService(estoque, estoque);
    enfileirar = new EnfileirarExecucaoUseCase(repo);
    atribuir = new AtribuirMecanicoUseCase(repo);
    vincularServicos = new VincularServicosUseCase(repo, servicos);
    vincularProdutos = new VincularProdutosUseCase(repo, estoque);
    concluir = new ConcluirDiagnosticoUseCase(repo, os, estoqueService);
    iniciar = new IniciarExecucaoUseCase(repo);
    finalizar = new FinalizarExecucaoUseCase(repo, os);
    liberar = new LiberarExecucaoUseCase(repo, estoqueService);
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
    await enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' });
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

  describe('enfileirar (OS Service)', () => {
    it('cria NA_FILA com posicao na fila e e idempotente', async () => {
      expect((await enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' })).posicaoFila).toBe(1);
      const r = await enfileirar.execute({ numeroOS: 'OS-2', veiculoId: 'v2' });
      expect([r.execucao.status, r.posicaoFila]).toEqual([S.NA_FILA, 2]);
      expect((await enfileirar.execute({ numeroOS: 'OS-2', veiculoId: 'v2' })).posicaoFila).toBe(2);
      expect(repo.itens.size).toBe(2);
    });

    it('recusa veiculo ja em execucao; libera depois de cancelada', async () => {
      await enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' });
      await expect(enfileirar.execute({ numeroOS: 'OS-9', veiculoId: 'v1' })).rejects.toThrow(
        ConflitoDeNegocioError,
      );
      await liberar.execute({ osId: 'OS-1' });
      await expect(
        enfileirar.execute({ numeroOS: 'OS-9', veiculoId: 'v1' }),
      ).resolves.toBeDefined();
    });

    it('posicao 0 quando ja saiu da fila', async () => {
      await enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' });
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'm' });
      expect((await enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' })).posicaoFila).toBe(0);
    });
  });

  describe('atribuir mecanico', () => {
    beforeEach(() => enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' }));

    it('ADMIN atribui; mesmo mecanico e idempotente; reatribui no diagnostico', async () => {
      expect((await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' })).status).toBe(
        S.ATRIBUIDA,
      );
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
      expect(repo.itens.get('OS-1')?.versao).toBe(2);
      expect((await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-2' })).mecanicoId).toBe(
        'mec-2',
      );
    });

    it('MECANICO assume da fila so para si e nao toma a de outro', async () => {
      await expect(
        atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-2', ator: mecanico('mec-1') }),
      ).rejects.toThrow(NotOwnedByUserError);
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1', ator: mecanico('mec-1') });
      await expect(
        atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-2', ator: mecanico('mec-2') }),
      ).rejects.toThrow(NotOwnedByUserError);
    });

    it('404 se a OS nao foi enfileirada', async () => {
      await expect(atribuir.execute({ osId: 'OS-X', mecanicoId: 'm' })).rejects.toThrow(
        ExecucaoNaoEncontradaError,
      );
    });
  });

  describe('vinculos', () => {
    it('vincula servicos (snapshot) e pecas; um produto atende varios servicos', async () => {
      await prepararDiagnostico();
      const e = await new BuscarExecucaoUseCase(repo).execute({ osId: 'OS-1' });
      expect(e.status).toBe(S.EM_DIAGNOSTICO);
      expect(e.servicos.map((s) => [s.servicoId, s.nome, s.preco])).toEqual([
        ['s1', 'Troca de oleo', 100],
        ['s2', 'Revisao', 50],
      ]);
      expect(e.valorTotal).toBe(100 + 50 + 3 * 30 + 20);
    });

    it('erros: servico/produto/execucao inexistentes', async () => {
      await enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' });
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
      await enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' });
      await expect(
        vincularServicos.execute({ osId: 'OS-1', servicoIds: ['s1'], ator: mecanico('mec-1') }),
      ).rejects.toThrow(NotOwnedByUserError);
      await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
      await expect(
        vincularServicos.execute({ osId: 'OS-1', servicoIds: ['s1'], ator: mecanico('mec-2') }),
      ).rejects.toThrow(NotOwnedByUserError);
      await expect(
        vincularServicos.execute({ osId: 'OS-1', servicoIds: ['s1'], ator: mecanico('mec-1') }),
      ).resolves.toBeDefined();
    });
  });

  describe('concluir diagnostico (baixa + callback)', () => {
    it('baixa as pecas, registra movimentacoes e envia execucao.diagnostico-concluido', async () => {
      await prepararDiagnostico();
      const e = await concluir.execute({ osId: 'OS-1', diagnostico: 'Oleo vencido' });
      expect(e.status).toBe(S.AGUARDANDO_APROVACAO);
      expect([estoque.saldo('p1'), estoque.saldo('p2')]).toEqual([2, 0]);
      expect(
        estoque.movimentacoes.map((m) => [m.tipo, m.produtoId, m.servicoId, m.quantidade]),
      ).toEqual([
        [TipoMovimentacao.BAIXA, 'p1', 's1', 2],
        [TipoMovimentacao.BAIXA, 'p1', 's2', 1],
        [TipoMovimentacao.BAIXA, 'p2', 's2', 1],
      ]);
      expect(os.diagnosticos).toEqual([
        {
          numeroOS: 'OS-1',
          mecanicoId: 'mec-1',
          diagnostico: 'Oleo vencido',
          itens: e.itensDoDiagnostico(),
        },
      ]);
    });

    it('saldo insuficiente: nada baixa, nenhum callback e o status volta', async () => {
      await prepararDiagnostico(4, 2);
      await expect(concluir.execute({ osId: 'OS-1', diagnostico: 'x' })).rejects.toThrow(
        EstoqueInsuficienteError,
      );
      expect(estoque.saldo('p1')).toBe(5);
      expect(estoque.movimentacoes).toEqual([]);
      expect(repo.itens.get('OS-1')?.status).toBe(S.EM_DIAGNOSTICO);
      expect(os.diagnosticos).toEqual([]);
    });

    it('falha concorrente na transacao (condicao do banco) tambem restaura o status', async () => {
      await prepararDiagnostico();
      estoque.falharProximaAplicacao = new EstoqueInsuficienteError([
        { produtoId: 'p1', solicitado: 3, disponivel: null },
      ]);
      await expect(concluir.execute({ osId: 'OS-1', diagnostico: 'x' })).rejects.toThrow(
        EstoqueInsuficienteError,
      );
      expect(repo.itens.get('OS-1')?.status).toBe(S.EM_DIAGNOSTICO);
    });

    it('OS Service fora: devolve as pecas e restaura o status', async () => {
      await prepararDiagnostico();
      os.falha = new OsServiceIndisponivelError('fora');
      await expect(concluir.execute({ osId: 'OS-1', diagnostico: 'x' })).rejects.toThrow(
        OsServiceIndisponivelError,
      );
      expect([estoque.saldo('p1'), estoque.saldo('p2')]).toEqual([5, 1]);
      expect(
        estoque.movimentacoes.filter((m) => m.tipo === TipoMovimentacao.DEVOLUCAO),
      ).toHaveLength(3);
      expect(repo.itens.get('OS-1')).toMatchObject({
        status: S.EM_DIAGNOSTICO,
        estoqueBaixado: false,
        diagnostico: null,
      });
    });

    it('nao conclui duas vezes (sem baixa em dobro)', async () => {
      await prepararDiagnostico();
      await concluir.execute({ osId: 'OS-1', diagnostico: 'x' });
      await expect(concluir.execute({ osId: 'OS-1', diagnostico: 'x' })).rejects.toThrow(
        TransicaoDeStatusInvalidaError,
      );
      expect(estoque.saldo('p1')).toBe(2);
    });
  });

  describe('liberar (DELETE do OS Service = rollback)', () => {
    it('devolve tudo, marca CANCELADA e e idempotente', async () => {
      await prepararDiagnostico();
      await concluir.execute({ osId: 'OS-1', diagnostico: 'x' });
      const r1 = await liberar.execute({ osId: 'OS-1', motivo: 'reprovado' });
      expect(r1.execucao?.status).toBe(S.CANCELADA);
      expect(r1.devolucoes).toHaveLength(3);
      expect([estoque.saldo('p1'), estoque.saldo('p2')]).toEqual([5, 1]);
      const r2 = await liberar.execute({ osId: 'OS-1' });
      expect(r2.devolucoes).toEqual([]);
      expect(estoque.saldo('p1')).toBe(5);
    });

    it('sem execucao: 200 sem efeito', async () => {
      expect(await liberar.execute({ osId: 'OS-X' })).toEqual({ execucao: null, devolucoes: [] });
    });

    it('recusa depois de iniciada a execucao', async () => {
      await prepararDiagnostico();
      await concluir.execute({ osId: 'OS-1', diagnostico: 'x' });
      await iniciar.execute({ osId: 'OS-1' });
      await expect(liberar.execute({ osId: 'OS-1' })).rejects.toThrow(
        TransicaoDeStatusInvalidaError,
      );
    });
  });

  describe('iniciar (OS Service) e finalizar (mecanico)', () => {
    it('fluxo ate EXECUTADA com callback execucao.finalizada', async () => {
      await prepararDiagnostico();
      await concluir.execute({ osId: 'OS-1', diagnostico: 'x' });
      expect((await iniciar.execute({ osId: 'OS-1' })).status).toBe(S.EM_EXECUCAO);
      expect((await iniciar.execute({ osId: 'OS-1' })).status).toBe(S.EM_EXECUCAO);
      const e = await finalizar.execute({ osId: 'OS-1', ator: mecanico('mec-1') });
      expect(e.status).toBe(S.EXECUTADA);
      expect(os.finalizadas).toEqual([{ numeroOS: 'OS-1', finalizadaEm: e.finalizadaEm }]);
    });

    it('iniciar recusa se nao aguarda aprovacao', async () => {
      await prepararDiagnostico();
      await expect(iniciar.execute({ osId: 'OS-1' })).rejects.toThrow(
        TransicaoDeStatusInvalidaError,
      );
    });

    it('OS Service fora no finalizar: status revertido para EM_EXECUCAO', async () => {
      await prepararDiagnostico();
      await concluir.execute({ osId: 'OS-1', diagnostico: 'x' });
      await iniciar.execute({ osId: 'OS-1' });
      os.falha = new OsServiceIndisponivelError('fora');
      await expect(finalizar.execute({ osId: 'OS-1' })).rejects.toThrow(OsServiceIndisponivelError);
      expect(repo.itens.get('OS-1')).toMatchObject({ status: S.EM_EXECUCAO, finalizadaEm: null });
    });
  });

  it('listar: MECANICO ve as suas e a fila; ADMIN filtra por status', async () => {
    await enfileirar.execute({ numeroOS: 'OS-1', veiculoId: 'v1' });
    await enfileirar.execute({ numeroOS: 'OS-2', veiculoId: 'v2' });
    await enfileirar.execute({ numeroOS: 'OS-3', veiculoId: 'v3' });
    await atribuir.execute({ osId: 'OS-1', mecanicoId: 'mec-1' });
    await atribuir.execute({ osId: 'OS-2', mecanicoId: 'mec-2' });
    const listar = new ListarExecucoesUseCase(repo);
    expect((await listar.execute({ ator: mecanico('mec-2') })).map((e) => e.osId)).toEqual([
      'OS-2',
      'OS-3',
    ]);
    expect((await listar.execute({ status: S.NA_FILA })).map((e) => e.osId)).toEqual(['OS-3']);
    expect(await listar.execute({})).toHaveLength(3);
  });
});
