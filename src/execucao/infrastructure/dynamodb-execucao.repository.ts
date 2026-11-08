import { Inject, Injectable } from '@nestjs/common';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DYNAMO_DOCUMENT_CLIENT } from '../../dynamodb/dynamodb-client.factory';
import { TABELAS_DYNAMO, TabelasDynamo } from '../../dynamodb/tabelas.config';
import { escanearTudo } from '../../dynamodb/escanear-tudo';
import { Execucao, ExecucaoProps } from '../domain/execucao.entity';
import { ExecucaoRepository, FiltroExecucoes } from '../domain/execucao.repository';
import { ExecucaoAlteradaConcorrentementeError } from '../domain/errors/execucao-alterada-concorrentemente.error';

/**
 * Tabela `execucoes` (PK `osId`): 1 item por OS com os servicos e pecas
 * embutidos (lidos/gravados sempre juntos). Lock otimista pelo atributo
 * `versao` (`ConditionExpression`).
 */
@Injectable()
export class DynamoDbExecucaoRepository implements ExecucaoRepository {
  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
    @Inject(TABELAS_DYNAMO) private readonly tabelas: TabelasDynamo,
  ) {}

  async salvar(execucao: Execucao): Promise<void> {
    const versaoLida = execucao.versao;
    const condicao =
      versaoLida === 0
        ? { ConditionExpression: 'attribute_not_exists(osId)' }
        : {
            ConditionExpression: 'versao = :versaoLida',
            ExpressionAttributeValues: { ':versaoLida': versaoLida },
          };
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tabelas.execucoes,
          Item: { ...execucao.toJSON(), versao: versaoLida + 1 },
          ...condicao,
        }),
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException)
        throw new ExecucaoAlteradaConcorrentementeError(execucao.osId);
      throw e;
    }
    execucao.marcarPersistida();
  }

  async buscarPorOsId(osId: string): Promise<Execucao | null> {
    const { Item } = await this.client.send(
      new GetCommand({ TableName: this.tabelas.execucoes, Key: { osId }, ConsistentRead: true }),
    );
    return Item ? Execucao.reconstituir(Item as ExecucaoProps) : null;
  }

  async listar(filtro: FiltroExecucoes): Promise<Execucao[]> {
    const condicoes: string[] = [];
    const nomes: Record<string, string> = {};
    const valores: Record<string, unknown> = {};
    if (filtro.mecanicoId) {
      condicoes.push('mecanicoId = :mecanicoId');
      valores[':mecanicoId'] = filtro.mecanicoId;
    }
    if (filtro.status) {
      condicoes.push('#status = :status'); // `status` e palavra reservada
      nomes['#status'] = 'status';
      valores[':status'] = filtro.status;
    }
    const itens = await escanearTudo(
      this.client,
      (ExclusiveStartKey) =>
        new ScanCommand({
          TableName: this.tabelas.execucoes,
          ExclusiveStartKey,
          ...(condicoes.length
            ? {
                FilterExpression: condicoes.join(' AND '),
                ExpressionAttributeValues: valores,
                ...(Object.keys(nomes).length ? { ExpressionAttributeNames: nomes } : {}),
              }
            : {}),
        }),
    );
    return itens.map((i) => Execucao.reconstituir(i as unknown as ExecucaoProps));
  }

  async remover(osId: string, versao: number): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tabelas.execucoes,
        Key: { osId },
        ConditionExpression: 'versao = :versao',
        ExpressionAttributeValues: { ':versao': versao },
      }),
    );
  }
}
