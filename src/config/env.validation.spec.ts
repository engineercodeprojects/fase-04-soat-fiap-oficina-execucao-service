import { validateEnv } from './env.validation';

const ok = { JWT_SECRET: 'x'.repeat(40), OS_SERVICE_URL: 'http://localhost:3000' };

describe('validateEnv', () => {
  it('aceita configuracao valida', () => expect(validateEnv(ok)).toBe(ok));
  it('exige JWT_SECRET', () =>
    expect(() => validateEnv({ ...ok, JWT_SECRET: '' })).toThrow(/JWT_SECRET/));
  it('rejeita placeholder', () =>
    expect(() => validateEnv({ ...ok, JWT_SECRET: 'changeme' })).toThrow(/placeholder/));
  it('exige segredo forte em producao', () =>
    expect(() => validateEnv({ ...ok, NODE_ENV: 'production', JWT_SECRET: 'curto' })).toThrow(
      /32/,
    ));
  it('tolera segredo curto fora de producao', () =>
    expect(() => validateEnv({ ...ok, JWT_SECRET: 'curto' })).not.toThrow());
  it('rejeita DYNAMODB_ENDPOINT que nao e URL', () =>
    expect(() => validateEnv({ ...ok, DYNAMODB_ENDPOINT: 'localhost:8000' })).toThrow(
      /DYNAMODB_ENDPOINT/,
    ));
  it('aceita DYNAMODB_ENDPOINT http', () =>
    expect(() => validateEnv({ ...ok, DYNAMODB_ENDPOINT: 'http://localhost:8000' })).not.toThrow());
  it('rejeita OS_SERVICE_URL invalida', () =>
    expect(() => validateEnv({ ...ok, OS_SERVICE_URL: 'oficina-app' })).toThrow(/OS_SERVICE_URL/));
  it('exige OS_SERVICE_URL em producao', () =>
    expect(() => validateEnv({ JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'production' })).toThrow(
      /OS_SERVICE_URL/,
    ));
});
