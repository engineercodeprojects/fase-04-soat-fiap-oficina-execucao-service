import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const DYNAMO_DOCUMENT_CLIENT = Symbol('DYNAMO_DOCUMENT_CLIENT');

/**
 * Cliente DynamoDB (SDK v3). `DYNAMODB_ENDPOINT` aponta para o DynamoDB Local
 * (docker-compose/testes); sem ele, o SDK usa o endpoint regional da AWS e a
 * cadeia padrao de credenciais (role do node no EKS / LabRole).
 */
export function criarDynamoDbClient(env: NodeJS.ProcessEnv = process.env): DynamoDBClient {
  const config: DynamoDBClientConfig = { region: env.AWS_REGION || 'us-east-1' };
  if (env.DYNAMODB_ENDPOINT) {
    config.endpoint = env.DYNAMODB_ENDPOINT;
    // O DynamoDB Local aceita qualquer credencial; evita depender de ~/.aws em dev/CI.
    if (!env.AWS_ACCESS_KEY_ID) {
      config.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
    }
  }
  return new DynamoDBClient(config);
}

export function criarDocumentClient(client: DynamoDBClient): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
  });
}
