import { Inject, Injectable } from '@nestjs/common';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { DYNAMO_DOCUMENT_CLIENT } from '../../dynamodb/dynamodb-client.factory';
import { TABELAS_DYNAMO, TabelasDynamo } from '../../dynamodb/tabelas.config';
import { escanearTudo } from '../../dynamodb/escanear-tudo';
import { Servico, ServicoProps } from '../domain/servico.entity';
import { ServicoRepository } from '../domain/servico.repository';

/** Tabela `servicos` (PK `servicoId`). Catalogo pequeno: listagem por Scan paginado. */
@Injectable()
export class DynamoDbServicoRepository implements ServicoRepository {
  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
    @Inject(TABELAS_DYNAMO) private readonly tabelas: TabelasDynamo,
  ) {}

  async salvar(servico: Servico): Promise<void> {
    await this.client.send(
      new PutCommand({ TableName: this.tabelas.servicos, Item: servico.toJSON() }),
    );
  }

  async buscarPorId(servicoId: string): Promise<Servico | null> {
    const { Item } = await this.client.send(
      new GetCommand({ TableName: this.tabelas.servicos, Key: { servicoId } }),
    );
    return Item ? Servico.reconstituir(Item as ServicoProps) : null;
  }

  async listar(): Promise<Servico[]> {
    const itens = await escanearTudo(
      this.client,
      (ExclusiveStartKey) =>
        new ScanCommand({ TableName: this.tabelas.servicos, ExclusiveStartKey }),
    );
    return itens.map((i) => Servico.reconstituir(i as unknown as ServicoProps));
  }

  async remover(servicoId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({ TableName: this.tabelas.servicos, Key: { servicoId } }),
    );
  }
}
