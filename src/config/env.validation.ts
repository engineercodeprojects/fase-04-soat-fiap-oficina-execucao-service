/**
 * Fail-fast no boot (`ConfigModule.forRoot({ validate })`): sem JWT_SECRET o
 * servico nao valida os tokens da Lambda; URLs invalidas (DynamoDB Local,
 * OS Service) quebram so na primeira chamada — melhor falhar no boot.
 */
const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRETS = new Set([
  'change-me-to-a-strong-random-secret',
  'changeme',
  'change-me',
  'secret',
]);

function exigirUrlHttp(config: Record<string, unknown>, chave: string): void {
  const valor = config[chave];
  if (valor === undefined || valor === '') return;
  if (typeof valor !== 'string' || !/^https?:\/\/.+/.test(valor)) {
    throw new Error(`${chave} deve ser uma URL http(s).`);
  }
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const secret = config.JWT_SECRET;
  if (typeof secret !== 'string' || secret.length === 0)
    throw new Error('JWT_SECRET e obrigatorio.');
  if (PLACEHOLDER_SECRETS.has(secret))
    throw new Error('JWT_SECRET nao pode ser um placeholder (gere com `openssl rand -base64 48`).');
  if (config.NODE_ENV === 'production' && secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET deve ter ao menos ${MIN_SECRET_LENGTH} caracteres em producao.`);
  }
  exigirUrlHttp(config, 'DYNAMODB_ENDPOINT');
  exigirUrlHttp(config, 'OS_SERVICE_URL');
  if (config.NODE_ENV === 'production' && !config.OS_SERVICE_URL) {
    throw new Error('OS_SERVICE_URL e obrigatoria em producao.');
  }
  return config;
}
