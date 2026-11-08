import { Inject, Injectable } from '@nestjs/common';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { HealthIndicator } from '@guilhermeqmaia/oficina-kit/health';
import { DYNAMO_DOCUMENT_CLIENT } from './dynamodb-client.factory';
import { TABELAS_DYNAMO, TabelasDynamo } from './tabelas.config';

/** Readiness: a tabela principal (execucoes) existe e responde. Plugado no HealthModule do kit. */
@Injectable()
export class DynamoDbHealthIndicator implements HealthIndicator {
  readonly name = 'database';

  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
    @Inject(TABELAS_DYNAMO) private readonly tabelas: TabelasDynamo,
  ) {}

  async check(): Promise<void> {
    await this.client.send(new DescribeTableCommand({ TableName: this.tabelas.execucoes }));
  }
}
