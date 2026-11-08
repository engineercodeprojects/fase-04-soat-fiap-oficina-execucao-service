import axios from 'axios';
import { EmissorTokenServico } from '@guilhermeqmaia/oficina-kit/http';
import { OsServiceClient } from './os-service.client';
import { montarPath, resolverOsServiceConfig } from './os-service.config';
import { OsServiceIndisponivelFilter } from './os-service-indisponivel.filter';
import { OsServiceIndisponivelError } from '../../application/ports/os-service.gateway';
import { OsServiceRecusouError } from '../../domain/errors/os-service-recusou.error';
import { StatusExecucao } from '../../domain/status-execucao';
import { ServidorHttpFake } from '../../../test/servidor-http-fake';

const os = new ServidorHttpFake();
const emissor = new EmissorTokenServico('execucao-service', { secret: process.env.JWT_SECRET! });
const cliente = (env: NodeJS.ProcessEnv = {}) =>
  new OsServiceClient(
    axios.create(),
    resolverOsServiceConfig({ OS_SERVICE_URL: `${os.url}/`, OS_SERVICE_RETRIES: '1', ...env }),
    emissor,
  );

describe('OsServiceClient', () => {
  beforeAll(() => os.iniciar());
  afterEach(() => os.limpar());
  afterAll(() => os.parar());

  it('PATCH /os/{id}/mecanico com token de servico e correlation id', async () => {
    await cliente().atribuirMecanico('OS 1', 'mec-1');
    const [r] = os.recebidas;
    expect(r).toMatchObject({
      method: 'PATCH',
      url: '/os/OS%201/mecanico',
      body: { mecanicoId: 'mec-1' },
    });
    expect(r.headers.authorization).toMatch(/^Bearer .+/);
    expect(r.headers['x-correlation-id']).toBe('OS 1');
  });

  it('PATCH /os/{id}/status aplicando o mapa de status (EXECUTADA -> FINALIZADA)', async () => {
    os.responder({ status: 204 }, { status: 204 });
    await cliente().atualizarStatus('7', StatusExecucao.EXECUTADA);
    await cliente().atualizarStatus('7', StatusExecucao.EM_EXECUCAO);
    expect(os.recebidas.map((r) => [r.method, r.url, r.body])).toEqual([
      ['PATCH', '/os/7/status', { status: 'FINALIZADA' }],
      ['PATCH', '/os/7/status', { status: 'EM_EXECUCAO' }],
    ]);
  });

  it('metodo, paths e mapa configuraveis', async () => {
    await cliente({
      OS_SERVICE_HTTP_METHOD: 'post',
      OS_SERVICE_STATUS_PATH: '/ordens/{osId}/st',
      OS_SERVICE_STATUS_MAP: '{"EM_EXECUCAO":"X"}',
    }).atualizarStatus('7', StatusExecucao.EM_EXECUCAO);
    expect(os.recebidas[0]).toMatchObject({
      method: 'POST',
      url: '/ordens/7/st',
      body: { status: 'X' },
    });
  });

  it('4xx vira OsServiceRecusouError sem retry (usa `motivo`)', async () => {
    os.responder({ status: 409, body: { motivo: 'OS cancelada' } });
    await expect(cliente().atualizarStatus('7', StatusExecucao.EM_EXECUCAO)).rejects.toEqual(
      new OsServiceRecusouError(409, 'OS cancelada'),
    );
    expect(os.recebidas).toHaveLength(1);
    os.responder({ status: 404, body: { message: ['nao achei'] } });
    await expect(cliente().atualizarStatus('7', StatusExecucao.EM_EXECUCAO)).rejects.toThrow(
      'nao achei',
    );
    os.responder({ status: 400 });
    await expect(cliente().atualizarStatus('7', StatusExecucao.EM_EXECUCAO)).rejects.toThrow(
      'sem detalhes',
    );
  });

  it('5xx: retry e depois OsServiceIndisponivelError', async () => {
    os.responder({ status: 503 }, { status: 503 });
    await expect(cliente().atualizarStatus('7', StatusExecucao.EM_EXECUCAO)).rejects.toBeInstanceOf(
      OsServiceIndisponivelError,
    );
    expect(os.recebidas).toHaveLength(2);
  });

  it('5xx seguido de sucesso', async () => {
    os.responder({ status: 500 }, { status: 200 });
    await expect(
      cliente().atualizarStatus('7', StatusExecucao.EM_EXECUCAO),
    ).resolves.toBeUndefined();
  });

  it('sem OS_SERVICE_URL a propagacao e ignorada (dev)', async () => {
    await expect(
      cliente({ OS_SERVICE_URL: '' }).atribuirMecanico('7', 'mec'),
    ).resolves.toBeUndefined();
    expect(os.recebidas).toEqual([]);
  });
});

describe('resolverOsServiceConfig', () => {
  it('defaults', () => {
    expect(resolverOsServiceConfig({})).toMatchObject({
      baseUrl: '',
      metodo: 'PATCH',
      mecanicoPath: '/os/{osId}/mecanico',
      statusPath: '/os/{osId}/status',
      timeoutMs: 5000,
      retries: 2,
      mapaStatus: { EXECUTADA: 'FINALIZADA' },
    });
    expect(resolverOsServiceConfig({ OS_SERVICE_RETRIES: 'abc' }).retries).toBe(0);
  });
  it('valida metodo e mapa', () => {
    expect(() => resolverOsServiceConfig({ OS_SERVICE_HTTP_METHOD: 'GET' })).toThrow(/METHOD/);
    expect(() => resolverOsServiceConfig({ OS_SERVICE_STATUS_MAP: '{x' })).toThrow(/STATUS_MAP/);
  });
  it('montarPath codifica o id', () => expect(montarPath('/os/{osId}', 'a/b')).toBe('/os/a%2Fb'));
});

describe('OsServiceIndisponivelFilter', () => {
  it('responde 502', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };
    new OsServiceIndisponivelFilter().catch(new OsServiceIndisponivelError('fora'), host as never);
    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 502, message: 'fora' }),
    );
  });
});
