import {
  CreateTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { definicoesTabelas } from './definicoes-tabelas';
import { TabelasDynamo } from './tabelas.config';

/** Cria as tabelas que ainda nao existem (idempotente). Usado pelo script local e pelos testes e2e. */
export async function criarTabelas(
  client: DynamoDBClient,
  tabelas: TabelasDynamo,
): Promise<string[]> {
  const criadas: string[] = [];
  for (const definicao of definicoesTabelas(tabelas)) {
    try {
      await client.send(new CreateTableCommand(definicao));
      criadas.push(definicao.TableName!);
    } catch (e) {
      if (!(e instanceof ResourceInUseException)) throw e;
    }
    await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: definicao.TableName! });
  }
  return criadas;
}
