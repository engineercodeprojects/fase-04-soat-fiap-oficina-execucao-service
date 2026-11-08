import { Inject, Injectable } from '@nestjs/common';
import {
  BatchGetCommand,
  BatchGetCommandOutput,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DYNAMO_DOCUMENT_CLIENT } from '../../dynamodb/dynamodb-client.factory';
import { TABELAS_DYNAMO, TabelasDynamo } from '../../dynamodb/tabelas.config';
import { escanearTudo } from '../../dynamodb/escanear-tudo';
import { Produto, ProdutoProps } from '../domain/produto.entity';
import { ProdutoRepository } from '../domain/produto.repository';
import { ProdutoNaoEncontradoError } from '../domain/errors/produto-nao-encontrado.error';

const LIMITE_BATCH_GET = 100;

/** Tabela `produtos` (PK `produtoId`). */
@Injectable()
export class DynamoDbProdutoRepository implements ProdutoRepository {
  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
    @Inject(TABELAS_DYNAMO) private readonly tabelas: TabelasDynamo,
  ) {}

  async criar(produto: Produto): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tabelas.produtos,
        Item: produto.toJSON(),
        ConditionExpression: 'attribute_not_exists(produtoId)',
      }),
    );
  }

  async atualizarCadastro(produto: Produto): Promise<void> {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tabelas.produtos,
          Key: { produtoId: produto.produtoId },
          UpdateExpression: 'SET nome = :nome, sku = :sku, preco = :preco, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(produtoId)',
          ExpressionAttributeValues: {
            ':nome': produto.nome,
            ':sku': produto.sku,
            ':preco': produto.preco,
            ':updatedAt': produto.updatedAt,
          },
        }),
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException)
        throw new ProdutoNaoEncontradoError(produto.produtoId);
      throw e;
    }
  }

  async buscarPorId(produtoId: string): Promise<Produto | null> {
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tabelas.produtos,
        Key: { produtoId },
        ConsistentRead: true,
      }),
    );
    return Item ? Produto.reconstituir(Item as ProdutoProps) : null;
  }

  async buscarPorIds(produtoIds: string[]): Promise<Map<string, Produto>> {
    const encontrados = new Map<string, Produto>();
    const tabela = this.tabelas.produtos;
    for (let i = 0; i < produtoIds.length; i += LIMITE_BATCH_GET) {
      let pendentes: Record<string, unknown>[] | undefined = produtoIds
        .slice(i, i + LIMITE_BATCH_GET)
        .map((produtoId) => ({ produtoId }));
      while (pendentes?.length) {
        const resposta: BatchGetCommandOutput = await this.client.send(
          new BatchGetCommand({
            RequestItems: { [tabela]: { Keys: pendentes, ConsistentRead: true } },
          }),
        );
        for (const item of resposta.Responses?.[tabela] ?? []) {
          const produto = Produto.reconstituir(item as ProdutoProps);
          encontrados.set(produto.produtoId, produto);
        }
        pendentes = resposta.UnprocessedKeys?.[tabela]?.Keys;
      }
    }
    return encontrados;
  }

  /** Catalogo pequeno: Scan filtrado. Para escalar, criar GSI em `sku` no infra-db. */
  async buscarPorSku(sku: string): Promise<Produto | null> {
    const itens = await escanearTudo(
      this.client,
      (ExclusiveStartKey) =>
        new ScanCommand({
          TableName: this.tabelas.produtos,
          FilterExpression: 'sku = :sku',
          ExpressionAttributeValues: { ':sku': sku },
          ExclusiveStartKey,
        }),
    );
    return itens.length ? Produto.reconstituir(itens[0] as unknown as ProdutoProps) : null;
  }

  async listar(): Promise<Produto[]> {
    const itens = await escanearTudo(
      this.client,
      (ExclusiveStartKey) =>
        new ScanCommand({ TableName: this.tabelas.produtos, ExclusiveStartKey }),
    );
    return itens.map((i) => Produto.reconstituir(i as unknown as ProdutoProps));
  }

  async remover(produtoId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({ TableName: this.tabelas.produtos, Key: { produtoId } }),
    );
  }
}
