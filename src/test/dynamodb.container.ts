import { DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { criarDynamoDbClient } from '../dynamodb/dynamodb-client.factory';
import { resolverTabelasDynamo } from '../dynamodb/tabelas.config';
import { criarTabelas } from '../dynamodb/criar-tabelas';

let container: StartedTestContainer | undefined;

/**
 * DynamoDB Local para os testes e2e. Com `DYNAMODB_ENDPOINT` ja definido (ex.:
 * `docker compose up`), usa esse endpoint; senao sobe `amazon/dynamodb-local`
 * via testcontainers. Cada suite usa um prefixo proprio de tabelas.
 */
export async function iniciarDynamoDbDeTeste(prefixo: string): Promise<void> {
  if (!process.env.DYNAMODB_ENDPOINT) {
    container = await new GenericContainer('amazon/dynamodb-local:2.5.4')
      .withCommand(['-jar', 'DynamoDBLocal.jar', '-inMemory', '-sharedDb'])
      .withExposedPorts(8000)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
    process.env.DYNAMODB_ENDPOINT = `http://${container.getHost()}:${container.getMappedPort(8000)}`;
  }
  process.env.DYNAMODB_TABLE_PREFIX = prefixo;
  const client = criarDynamoDbClient(process.env);
  await criarTabelas(client, resolverTabelasDynamo(process.env));
  client.destroy();
}

export async function pararDynamoDbDeTeste(): Promise<void> {
  const client = criarDynamoDbClient(process.env);
  for (const tabela of Object.values(resolverTabelasDynamo(process.env))) {
    await client.send(new DeleteTableCommand({ TableName: tabela })).catch(() => undefined);
  }
  client.destroy();
  if (container) {
    await container.stop();
    container = undefined;
    delete process.env.DYNAMODB_ENDPOINT;
  }
}
