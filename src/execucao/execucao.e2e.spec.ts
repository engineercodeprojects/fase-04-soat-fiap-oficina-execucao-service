import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { mintServiceToken, mintToken } from '@guilhermeqmaia/oficina-kit/testing';
import { Role } from '@guilhermeqmaia/oficina-kit/auth';
import { iniciarDynamoDbDeTeste, pararDynamoDbDeTeste } from '../test/dynamodb.container';
import { ServidorHttpFake } from '../test/servidor-http-fake';

jest.setTimeout(120000);

const admin = `Bearer ${mintToken({ sub: 'adm-1', role: Role.ADMIN })}`;
const estoquista = `Bearer ${mintToken({ sub: 'est-1', role: Role.ESTOQUISTA })}`;
const mecanico = `Bearer ${mintToken({ sub: 'mec-1', role: Role.MECANICO })}`;
const outroMecanico = `Bearer ${mintToken({ sub: 'mec-2', role: Role.MECANICO })}`;
const osService = `Bearer ${mintServiceToken({ servico: 'os-service' })}`;

/**
 * Fluxos criticos do contrato RFC-0008 contra DynamoDB Local real e um OS
 * Service fake (recebe os callbacks POST /ordens-servico/{numero}/eventos).
 */
describe('Execucao (e2e: DynamoDB Local + mock do OS Service)', () => {
  let app: INestApplication;
  const os = new ServidorHttpFake();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    await os.iniciar();
    process.env.OS_SERVICE_URL = os.url;
    process.env.OS_SERVICE_TENTATIVAS = '1';
    await iniciarDynamoDbDeTeste('e2e-exec-');
    const { AppModule } = await import('../app.module');
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await pararDynamoDbDeTeste();
    await os.parar();
  });
  beforeEach(() => os.limpar());

  async function catalogo() {
    const s1 = await api()
      .post('/catalogo/servicos')
      .set('Authorization', admin)
      .send({ nome: 'Troca de oleo', precoBase: 100 })
      .expect(201);
    const s2 = await api()
      .post('/catalogo/servicos')
      .set('Authorization', admin)
      .send({ nome: 'Revisao', precoBase: 50 })
      .expect(201);
    const p1 = await api()
      .post('/catalogo/produtos')
      .set('Authorization', estoquista)
      .send({ nome: 'Oleo 5W30', sku: `OL-${Math.random()}`, preco: 30, quantidadeEstoque: 5 })
      .expect(201);
    return { s1: s1.body.servicoId, s2: s2.body.servicoId, p1: p1.body.produtoId };
  }

  async function diagnostico(numeroOS: string, qtdS1: number, qtdS2: number) {
    const c = await catalogo();
    await api()
      .post('/execucao/ordens')
      .set('Authorization', osService)
      .send({ numeroOS, veiculoId: `v-${numeroOS}`, descricaoProblema: 'Barulho' })
      .expect(201);
    await api()
      .post(`/execucao/ordens/${numeroOS}/atribuir-mecanico`)
      .set('Authorization', mecanico)
      .send({ mecanicoId: 'mec-1' })
      .expect(200);
    await api()
      .post(`/execucao/ordens/${numeroOS}/servicos`)
      .set('Authorization', mecanico)
      .send({ servicoIds: [c.s1, c.s2] })
      .expect(201);
    for (const [servicoId, quantidade] of [
      [c.s1, qtdS1],
      [c.s2, qtdS2],
    ]) {
      await api()
        .post(`/execucao/ordens/${numeroOS}/servicos/${servicoId}/produtos`)
        .set('Authorization', mecanico)
        .send({ produtos: [{ produtoId: c.p1, quantidade }] })
        .expect(201);
    }
    return c;
  }

  const saldo = async (produtoId: string) =>
    (await api().get(`/catalogo/produtos/${produtoId}`).set('Authorization', admin).expect(200))
      .body.quantidadeEstoque;

  it('roles por rota: 401 sem token, 403 com role errada, 400 validacao', async () => {
    await api().get('/catalogo/servicos').expect(401);
    await api()
      .post('/catalogo/servicos')
      .set('Authorization', mecanico)
      .send({ nome: 'x', precoBase: 1 })
      .expect(403);
    await api()
      .post('/catalogo/produtos')
      .set('Authorization', mecanico)
      .send({ nome: 'x', sku: 'x', preco: 1 })
      .expect(403);
    await api()
      .post('/execucao/ordens')
      .set('Authorization', mecanico)
      .send({ numeroOS: 'X', veiculoId: 'v' })
      .expect(403);
    await api().delete('/execucao/ordens/OS-R').set('Authorization', mecanico).expect(403);
    await api().post('/execucao/ordens/OS-R/iniciar').set('Authorization', mecanico).expect(403);
    await api()
      .post('/catalogo/servicos')
      .set('Authorization', admin)
      .send({ nome: '', precoBase: -1 })
      .expect(400);
  });

  it('fluxo feliz: enfileirar -> atribuir -> diagnostico (baixa + callback) -> iniciar -> finalizar', async () => {
    const c = await diagnostico('OS-100', 2, 1);
    await api().get('/execucao/ordens/OS-100').set('Authorization', outroMecanico).expect(403);

    const res = await api()
      .post('/execucao/ordens/OS-100/diagnostico')
      .set('Authorization', mecanico)
      .send({ diagnostico: 'Oleo vencido' })
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'AGUARDANDO_APROVACAO',
      valorTotal: 100 + 50 + 3 * 30,
    });
    expect(await saldo(c.p1)).toBe(2);
    const movs = await api()
      .get('/execucao/ordens/OS-100/movimentacoes')
      .set('Authorization', admin)
      .expect(200);
    expect(
      movs.body.map((m: { tipo: string; quantidade: number }) => [m.tipo, m.quantidade]).sort(),
    ).toEqual([
      ['BAIXA', 1],
      ['BAIXA', 2],
    ]);

    const iniciada = await api()
      .post('/execucao/ordens/OS-100/iniciar')
      .set('Authorization', osService)
      .expect(200);
    expect(iniciada.body).toEqual({ numeroOS: 'OS-100', status: 'EM_EXECUCAO' });
    await api().post('/execucao/ordens/OS-100/iniciar').set('Authorization', osService).expect(200);
    const fim = await api()
      .post('/execucao/ordens/OS-100/finalizar')
      .set('Authorization', mecanico)
      .expect(200);
    expect(fim.body.status).toBe('EXECUTADA');

    expect(os.recebidas.map((r) => [r.method, r.url])).toEqual([
      ['POST', '/ordens-servico/OS-100/eventos'],
      ['POST', '/ordens-servico/OS-100/eventos'],
    ]);
    const [diag, finalizada] = os.recebidas.map(
      (r) => r.body as { type: string; producer: string; data: Record<string, unknown> },
    );
    expect(diag).toMatchObject({
      type: 'execucao.diagnostico-concluido',
      producer: 'execucao-service',
      data: { numeroOS: 'OS-100', mecanicoId: 'mec-1', diagnostico: 'Oleo vencido' },
    });
    expect(diag.data.itens).toEqual([
      {
        tipo: 'SERVICO',
        referenciaId: c.s1,
        nome: 'Troca de oleo',
        quantidade: 1,
        precoUnitario: '100.00',
      },
      {
        tipo: 'PRODUTO',
        referenciaId: c.p1,
        nome: 'Oleo 5W30',
        quantidade: 2,
        precoUnitario: '30.00',
        servicoId: c.s1,
      },
      {
        tipo: 'SERVICO',
        referenciaId: c.s2,
        nome: 'Revisao',
        quantidade: 1,
        precoUnitario: '50.00',
      },
      {
        tipo: 'PRODUTO',
        referenciaId: c.p1,
        nome: 'Oleo 5W30',
        quantidade: 1,
        precoUnitario: '30.00',
        servicoId: c.s2,
      },
    ]);
    expect(finalizada).toMatchObject({ type: 'execucao.finalizada', data: { numeroOS: 'OS-100' } });
    expect(os.recebidas[0].headers.authorization).toMatch(/^Bearer /);
    expect(os.recebidas[0].headers['x-correlation-id']).toBe('OS-100');
  });

  it('enfileirar: idempotente por numeroOS e 409 { motivo } para veiculo ja em execucao', async () => {
    const corpo = { numeroOS: 'OS-150', veiculoId: 'v-dup' };
    const r1 = await api()
      .post('/execucao/ordens')
      .set('Authorization', osService)
      .send(corpo)
      .expect(201);
    expect(r1.body).toEqual({ numeroOS: 'OS-150', posicaoFila: expect.any(Number) });
    await api().post('/execucao/ordens').set('Authorization', osService).send(corpo).expect(201);
    const r = await api()
      .post('/execucao/ordens')
      .set('Authorization', osService)
      .send({ numeroOS: 'OS-151', veiculoId: 'v-dup' })
      .expect(409);
    expect(r.body.motivo).toContain('ja esta em execucao');
  });

  it('estoque insuficiente: 409 { motivo }, nada baixado, nenhum callback', async () => {
    const c = await diagnostico('OS-200', 4, 2);
    const res = await api()
      .post('/execucao/ordens/OS-200/diagnostico')
      .set('Authorization', mecanico)
      .send({ diagnostico: 'x' })
      .expect(409);
    expect(res.body.motivo).toContain('Estoque insuficiente');
    expect(await saldo(c.p1)).toBe(5);
    expect(os.recebidas).toEqual([]);
    const exec = await api().get('/execucao/ordens/OS-200').set('Authorization', admin);
    expect(exec.body.status).toBe('EM_DIAGNOSTICO');
  });

  it('DELETE (liberar-reservas) devolve as pecas e e idempotente', async () => {
    const c = await diagnostico('OS-300', 3, 2);
    await api()
      .post('/execucao/ordens/OS-300/diagnostico')
      .set('Authorization', mecanico)
      .send({ diagnostico: 'x' })
      .expect(200);
    expect(await saldo(c.p1)).toBe(0);
    const r = await api()
      .delete('/execucao/ordens/OS-300')
      .set('Authorization', osService)
      .send({ motivo: 'Orcamento reprovado' })
      .expect(200);
    expect(r.body).toMatchObject({ numeroOS: 'OS-300', status: 'CANCELADA' });
    expect(r.body.devolucoes).toHaveLength(2);
    expect(await saldo(c.p1)).toBe(5);
    const r2 = await api()
      .delete('/execucao/ordens/OS-300')
      .set('Authorization', osService)
      .expect(200);
    expect(r2.body.devolucoes).toEqual([]);
    expect(await saldo(c.p1)).toBe(5);
    const semExecucao = await api()
      .delete('/execucao/ordens/OS-NAO-EXISTE')
      .set('Authorization', osService)
      .expect(200);
    expect(semExecucao.body).toEqual({ numeroOS: 'OS-NAO-EXISTE', status: null, devolucoes: [] });
    const recusa = await api()
      .post('/execucao/ordens/OS-300/iniciar')
      .set('Authorization', osService)
      .expect(409);
    expect(recusa.body.motivo).toContain('CANCELADA');
  });

  it('OS Service fora do ar: 502 e a baixa e devolvida; recusa do OS = 409', async () => {
    const c = await diagnostico('OS-400', 1, 1);
    os.responder({ status: 503 });
    await api()
      .post('/execucao/ordens/OS-400/diagnostico')
      .set('Authorization', mecanico)
      .send({ diagnostico: 'x' })
      .expect(502);
    expect(await saldo(c.p1)).toBe(5);
    os.responder({ status: 409, body: { motivo: 'OS cancelada' } });
    const res = await api()
      .post('/execucao/ordens/OS-400/diagnostico')
      .set('Authorization', mecanico)
      .send({ diagnostico: 'x' })
      .expect(409);
    expect(res.body.motivo).toContain('OS cancelada');
    expect(await saldo(c.p1)).toBe(5);
  });

  it('CRUD de produtos com entrada de estoque auditada; SKU duplicado = 409', async () => {
    const p = await api()
      .post('/catalogo/produtos')
      .set('Authorization', estoquista)
      .send({ nome: 'Pastilha', sku: 'pst-e2e', preco: 80 })
      .expect(201);
    const id = p.body.produtoId;
    await api()
      .post('/catalogo/produtos')
      .set('Authorization', estoquista)
      .send({ nome: 'Outra', sku: 'PST-E2E', preco: 1 })
      .expect(409);
    await api()
      .post(`/catalogo/produtos/${id}/entradas`)
      .set('Authorization', estoquista)
      .send({ quantidade: 4 })
      .expect(201);
    const upd = await api()
      .patch(`/catalogo/produtos/${id}`)
      .set('Authorization', estoquista)
      .send({ preco: 90 })
      .expect(200);
    expect(upd.body).toMatchObject({ preco: 90, quantidadeEstoque: 4 });
    const movs = await api()
      .get(`/catalogo/produtos/${id}/movimentacoes`)
      .set('Authorization', estoquista);
    expect(movs.body).toHaveLength(1);
    expect(
      (await api().get('/catalogo/produtos').set('Authorization', mecanico)).body.length,
    ).toBeGreaterThan(0);
    await api().delete(`/catalogo/produtos/${id}`).set('Authorization', admin).expect(204);
    await api().get(`/catalogo/produtos/${id}`).set('Authorization', admin).expect(404);
  });

  it('CRUD de servicos e fila do mecanico', async () => {
    const s = await api()
      .post('/catalogo/servicos')
      .set('Authorization', admin)
      .send({ nome: 'Freios', precoBase: 70 });
    await api()
      .patch(`/catalogo/servicos/${s.body.servicoId}`)
      .set('Authorization', admin)
      .send({ precoBase: 75 })
      .expect(200);
    expect(
      (await api().get(`/catalogo/servicos/${s.body.servicoId}`).set('Authorization', mecanico))
        .body.precoBase,
    ).toBe(75);
    expect((await api().get('/catalogo/servicos').set('Authorization', mecanico)).status).toBe(200);
    await api()
      .delete(`/catalogo/servicos/${s.body.servicoId}`)
      .set('Authorization', admin)
      .expect(204);
    const fila = await api()
      .get('/execucao/ordens')
      .set('Authorization', outroMecanico)
      .expect(200);
    expect(
      fila.body.every(
        (e: { mecanicoId: string | null; status: string }) =>
          e.mecanicoId === 'mec-2' || e.status === 'NA_FILA',
      ),
    ).toBe(true);
  });
});
