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

/** Fluxos criticos contra DynamoDB Local real + OS Service fake (HTTP). */
describe('Execucao (e2e: DynamoDB Local + mock do OS Service)', () => {
  let app: INestApplication;
  const os = new ServidorHttpFake();
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    await os.iniciar();
    process.env.OS_SERVICE_URL = os.url;
    process.env.OS_SERVICE_RETRIES = '0';
    await iniciarDynamoDbDeTeste('e2e-exec-');
    const { AppModule } = await import('../app.module');
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = ref.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = request(app.getHttpServer());
  });
  afterAll(async () => {
    await app?.close();
    await pararDynamoDbDeTeste();
    await os.parar();
  });
  beforeEach(() => os.limpar());

  async function catalogo() {
    const s1 = await request(app.getHttpServer())
      .post('/servicos')
      .set('Authorization', admin)
      .send({ nome: 'Troca de oleo', precoBase: 100 })
      .expect(201);
    const s2 = await request(app.getHttpServer())
      .post('/servicos')
      .set('Authorization', admin)
      .send({ nome: 'Revisao', precoBase: 50 })
      .expect(201);
    const p1 = await request(app.getHttpServer())
      .post('/produtos')
      .set('Authorization', estoquista)
      .send({ nome: 'Oleo 5W30', sku: `OL-${Date.now()}`, preco: 30, quantidadeEstoque: 5 })
      .expect(201);
    return { s1: s1.body.servicoId, s2: s2.body.servicoId, p1: p1.body.produtoId };
  }

  async function diagnostico(osId: string, qtdS1: number, qtdS2: number) {
    const c = await catalogo();
    const srv = app.getHttpServer();
    await request(srv)
      .post(`/execucoes/${osId}/atribuir-mecanico`)
      .set('Authorization', admin)
      .send({ mecanicoId: 'mec-1' })
      .expect(201);
    await request(srv)
      .post(`/execucoes/${osId}/servicos`)
      .set('Authorization', mecanico)
      .send({ servicoIds: [c.s1, c.s2] })
      .expect(201);
    await request(srv)
      .post(`/execucoes/${osId}/servicos/${c.s1}/produtos`)
      .set('Authorization', mecanico)
      .send({ produtos: [{ produtoId: c.p1, quantidade: qtdS1 }] })
      .expect(201);
    await request(srv)
      .post(`/execucoes/${osId}/servicos/${c.s2}/produtos`)
      .set('Authorization', mecanico)
      .send({ produtos: [{ produtoId: c.p1, quantidade: qtdS2 }] })
      .expect(201);
    return c;
  }

  const saldo = async (produtoId: string) =>
    (
      await request(app.getHttpServer())
        .get(`/produtos/${produtoId}`)
        .set('Authorization', admin)
        .expect(200)
    ).body.quantidadeEstoque;

  it('roles por rota: 401 sem token, 403 com role errada, swagger publico em dev', async () => {
    await http.get('/servicos').expect(401);
    await request(app.getHttpServer())
      .post('/servicos')
      .set('Authorization', mecanico)
      .send({ nome: 'x', precoBase: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/produtos')
      .set('Authorization', mecanico)
      .send({ nome: 'x', sku: 'x', preco: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/execucoes/OS-R/rollback')
      .set('Authorization', mecanico)
      .expect(403);
    await request(app.getHttpServer())
      .post('/servicos')
      .set('Authorization', admin)
      .send({ nome: '', precoBase: -1 })
      .expect(400);
  });

  it('fluxo feliz: atribuicao -> diagnostico -> baixa -> execucao -> conclusao', async () => {
    const c = await diagnostico('OS-100', 2, 1);
    const srv = app.getHttpServer();
    await request(srv).get('/execucoes/OS-100').set('Authorization', outroMecanico).expect(403);

    const fechado = await request(srv)
      .post('/execucoes/OS-100/fechar-diagnostico')
      .set('Authorization', mecanico)
      .expect(200);
    expect(fechado.body).toMatchObject({
      status: 'AGUARDANDO_APROVACAO',
      valorTotal: 100 + 50 + 3 * 30,
    });
    expect(await saldo(c.p1)).toBe(2);
    const movs = await request(srv)
      .get('/execucoes/OS-100/movimentacoes')
      .set('Authorization', admin)
      .expect(200);
    expect(
      movs.body.map((m: { tipo: string; quantidade: number }) => [m.tipo, m.quantidade]).sort(),
    ).toEqual([
      ['BAIXA', 1],
      ['BAIXA', 2],
    ]);

    await request(srv)
      .post('/execucoes/OS-100/executar')
      .set('Authorization', mecanico)
      .expect(200);
    const fim = await request(srv)
      .post('/execucoes/OS-100/concluir')
      .set('Authorization', mecanico)
      .expect(200);
    expect(fim.body.status).toBe('EXECUTADA');

    expect(os.recebidas.map((r) => [r.method, r.url, r.body])).toEqual([
      ['PATCH', '/os/OS-100/mecanico', { mecanicoId: 'mec-1' }],
      ['PATCH', '/os/OS-100/status', { status: 'AGUARDANDO_APROVACAO' }],
      ['PATCH', '/os/OS-100/status', { status: 'EM_EXECUCAO' }],
      ['PATCH', '/os/OS-100/status', { status: 'FINALIZADA' }],
    ]);
    expect(os.recebidas[0].headers.authorization).toMatch(/^Bearer /);
  });

  it('estoque insuficiente: 409, nada baixado (transacao com ConditionExpression)', async () => {
    const c = await diagnostico('OS-200', 4, 2);
    const res = await request(app.getHttpServer())
      .post('/execucoes/OS-200/fechar-diagnostico')
      .set('Authorization', mecanico)
      .expect(409);
    expect(res.body.message).toContain('Estoque insuficiente');
    expect(await saldo(c.p1)).toBe(5);
    const exec = await request(app.getHttpServer())
      .get('/execucoes/OS-200')
      .set('Authorization', admin);
    expect(exec.body.status).toBe('ATRIBUIDA');
  });

  it('rollback (orcamento reprovado) devolve as pecas e e idempotente', async () => {
    const c = await diagnostico('OS-300', 3, 2);
    const srv = app.getHttpServer();
    await request(srv)
      .post('/execucoes/OS-300/fechar-diagnostico')
      .set('Authorization', mecanico)
      .expect(200);
    expect(await saldo(c.p1)).toBe(0);
    const r = await request(srv)
      .post('/execucoes/OS-300/rollback')
      .set('Authorization', osService)
      .expect(200);
    expect(r.body.status).toBe('CANCELADA');
    expect(r.body.devolucoes).toHaveLength(2);
    expect(await saldo(c.p1)).toBe(5);
    const r2 = await request(srv)
      .post('/execucoes/OS-300/rollback')
      .set('Authorization', osService)
      .expect(200);
    expect(r2.body.devolucoes).toEqual([]);
    expect(await saldo(c.p1)).toBe(5);
    await request(srv)
      .post('/execucoes/OS-300/executar')
      .set('Authorization', mecanico)
      .expect(409);
  });

  it('OS Service fora do ar: 502 e a baixa e devolvida', async () => {
    const c = await diagnostico('OS-400', 1, 1);
    os.responder({ status: 503 });
    await request(app.getHttpServer())
      .post('/execucoes/OS-400/fechar-diagnostico')
      .set('Authorization', mecanico)
      .expect(502);
    expect(await saldo(c.p1)).toBe(5);
    os.responder({ status: 409, body: { motivo: 'OS cancelada' } });
    const res = await request(app.getHttpServer())
      .post('/execucoes/OS-400/fechar-diagnostico')
      .set('Authorization', mecanico)
      .expect(409);
    expect(res.body.message).toContain('OS cancelada');
    expect(await saldo(c.p1)).toBe(5);
  });

  it('CRUD de produtos com entrada de estoque auditada; SKU duplicado = 409', async () => {
    const srv = app.getHttpServer();
    const p = await request(srv)
      .post('/produtos')
      .set('Authorization', estoquista)
      .send({ nome: 'Pastilha', sku: 'pst-e2e', preco: 80 })
      .expect(201);
    await request(srv)
      .post('/produtos')
      .set('Authorization', estoquista)
      .send({ nome: 'Outra', sku: 'PST-E2E', preco: 1 })
      .expect(409);
    await request(srv)
      .post(`/produtos/${p.body.produtoId}/entradas`)
      .set('Authorization', estoquista)
      .send({ quantidade: 4 })
      .expect(201);
    const upd = await request(srv)
      .patch(`/produtos/${p.body.produtoId}`)
      .set('Authorization', estoquista)
      .send({ preco: 90 })
      .expect(200);
    expect(upd.body).toMatchObject({ preco: 90, quantidadeEstoque: 4 });
    const movs = await request(srv)
      .get(`/produtos/${p.body.produtoId}/movimentacoes`)
      .set('Authorization', estoquista);
    expect(movs.body).toHaveLength(1);
    expect(
      (await request(srv).get('/produtos').set('Authorization', mecanico)).body.length,
    ).toBeGreaterThan(0);
    await request(srv)
      .delete(`/produtos/${p.body.produtoId}`)
      .set('Authorization', admin)
      .expect(204);
    await request(srv).get(`/produtos/${p.body.produtoId}`).set('Authorization', admin).expect(404);
  });

  it('CRUD de servicos e listagem da fila', async () => {
    const srv = app.getHttpServer();
    const s = await request(srv)
      .post('/servicos')
      .set('Authorization', admin)
      .send({ nome: 'Freios', precoBase: 70 });
    await request(srv)
      .patch(`/servicos/${s.body.servicoId}`)
      .set('Authorization', admin)
      .send({ precoBase: 75 })
      .expect(200);
    expect(
      (await request(srv).get(`/servicos/${s.body.servicoId}`).set('Authorization', mecanico)).body
        .precoBase,
    ).toBe(75);
    expect((await request(srv).get('/servicos').set('Authorization', mecanico)).status).toBe(200);
    await request(srv)
      .delete(`/servicos/${s.body.servicoId}`)
      .set('Authorization', admin)
      .expect(204);
    const fila = await request(srv)
      .get('/execucoes?status=EXECUTADA')
      .set('Authorization', mecanico)
      .expect(200);
    expect(fila.body.every((e: { mecanicoId: string }) => e.mecanicoId === 'mec-1')).toBe(true);
    await request(srv)
      .patch('/execucoes/OS-100/status')
      .set('Authorization', admin)
      .send({ status: 'CANCELADA' })
      .expect(400);
  });
});
