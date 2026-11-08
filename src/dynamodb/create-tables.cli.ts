/**
 * `npm run dynamodb:create-tables` — cria as tabelas no DynamoDB Local
 * (docker-compose). Le DYNAMODB_ENDPOINT, AWS_REGION e DYNAMODB_TABLE_PREFIX do `.env`.
 */
import 'dotenv/config';
import { criarDynamoDbClient } from './dynamodb-client.factory';
import { resolverTabelasDynamo } from './tabelas.config';
import { criarTabelas } from './criar-tabelas';

async function main(): Promise<void> {
  if (!process.env.DYNAMODB_ENDPOINT && process.env.ALLOW_AWS_CREATE_TABLES !== 'true') {
    throw new Error(
      'DYNAMODB_ENDPOINT ausente: este script e para o DynamoDB Local. Em producao as tabelas ' +
        'sao do Terraform (infra-db). Use ALLOW_AWS_CREATE_TABLES=true para forcar.',
    );
  }
  const client = criarDynamoDbClient(process.env);
  const tabelas = resolverTabelasDynamo(process.env);
  const criadas = await criarTabelas(client, tabelas);
  console.log(JSON.stringify({ msg: 'tabelas prontas', criadas, tabelas: Object.values(tabelas) }));
  client.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
