import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DYNAMO_DOCUMENT_CLIENT,
  criarDocumentClient,
  criarDynamoDbClient,
} from './dynamodb-client.factory';
import { TABELAS_DYNAMO, resolverTabelasDynamo } from './tabelas.config';
import { DynamoDbHealthIndicator } from './dynamodb-health.indicator';

/** Banco proprio deste servico (DynamoDB). Global: os repositorios injetam o cliente e os nomes. */
@Global()
@Module({
  providers: [
    {
      provide: DYNAMO_DOCUMENT_CLIENT,
      useFactory: () => criarDocumentClient(criarDynamoDbClient(process.env)),
    },
    { provide: TABELAS_DYNAMO, useFactory: () => resolverTabelasDynamo(process.env) },
    DynamoDbHealthIndicator,
  ],
  exports: [DYNAMO_DOCUMENT_CLIENT, TABELAS_DYNAMO, DynamoDbHealthIndicator],
})
export class DynamoDbModule implements OnApplicationShutdown {
  constructor(@Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient) {}

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
