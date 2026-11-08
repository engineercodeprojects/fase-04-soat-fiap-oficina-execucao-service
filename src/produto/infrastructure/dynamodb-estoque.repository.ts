import { Inject, Injectable } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DYNAMO_DOCUMENT_CLIENT } from '../../dynamodb/dynamodb-client.factory';
import { INDICES_DYNAMO, TABELAS_DYNAMO, TabelasDynamo } from '../../dynamodb/tabelas.config';
import { escanearTudo } from '../../dynamodb/escanear-tudo';
import { DadoInvalidoError } from '../../shared/domain/erros-de-dominio';
import { MovimentacaoEstoque } from '../domain/movimentacao-estoque';
import { EstoqueRepository } from '../domain/produto.repository';
import { consolidarPorProduto } from '../domain/estoque';
import { EstoqueInsuficienteError, ItemEmFalta } from '../domain/errors/estoque-insuficiente.error';
import { ProdutoNaoEncontradoError } from '../domain/errors/produto-nao-encontrado.error';

/** Limite de itens por TransactWriteItems no DynamoDB. */
export const LIMITE_ITENS_TRANSACAO = 100;

type Acao = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

/**
 * Baixa/devolucao/entrada em UMA transacao (`TransactWriteItems`):
 * - 1 `Update` por produto (o DynamoDB nao permite 2 operacoes no mesmo item
 *   numa transacao, por isso o delta e consolidado por produto) com
 *   `ConditionExpression` que exige o produto existir e, se o delta for
 *   negativo, `quantidadeEstoque >= :necessario` — o saldo nunca fica negativo;
 * - 1 `Put` por movimentacao em `movimentacoes_estoque` (auditoria), com
 *   `attribute_not_exists(movimentacaoId)`.
 * Qualquer condicao falha => nada e gravado.
 */
@Injectable()
export class DynamoDbEstoqueRepository implements EstoqueRepository {
  constructor(
    @Inject(DYNAMO_DOCUMENT_CLIENT) private readonly client: DynamoDBDocumentClient,
    @Inject(TABELAS_DYNAMO) private readonly tabelas: TabelasDynamo,
  ) {}

  async aplicar(movimentacoes: MovimentacaoEstoque[]): Promise<void> {
    if (!movimentacoes.length) return;
    const deltas = [...consolidarPorProduto(movimentacoes)];
    const total = deltas.length + movimentacoes.length;
    if (total > LIMITE_ITENS_TRANSACAO) {
      throw new DadoInvalidoError(
        `Operacao de estoque excede ${LIMITE_ITENS_TRANSACAO} itens por transacao (${total})`,
      );
    }
    const agora = new Date().toISOString();
    const atualizacoes: Acao[] = deltas.map(([produtoId, delta]) => ({
      Update: {
        TableName: this.tabelas.produtos,
        Key: { produtoId },
        UpdateExpression: 'SET quantidadeEstoque = quantidadeEstoque + :delta, updatedAt = :agora',
        ConditionExpression:
          delta < 0
            ? 'attribute_exists(produtoId) AND quantidadeEstoque >= :necessario'
            : 'attribute_exists(produtoId)',
        ExpressionAttributeValues: {
          ':delta': delta,
          ':agora': agora,
          ...(delta < 0 ? { ':necessario': -delta } : {}),
        },
        ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
      },
    }));
    const registros: Acao[] = movimentacoes.map((m) => ({
      Put: {
        TableName: this.tabelas.movimentacoesEstoque,
        // Atributos de chave de GSI nao aceitam NULL: ENTRADA (sem OS) fica fora do indice por OS.
        Item: Object.fromEntries(Object.entries(m).filter(([, v]) => v !== null)),
        ConditionExpression: 'attribute_not_exists(movimentacaoId)',
      },
    }));
    try {
      await this.client.send(
        new TransactWriteCommand({ TransactItems: [...atualizacoes, ...registros] }),
      );
    } catch (e) {
      throw this.traduzirCancelamento(e, deltas);
    }
  }

  async listarPorOs(osId: string): Promise<MovimentacaoEstoque[]> {
    return this.consultarIndice(INDICES_DYNAMO.movimentacoesPorOs, 'osId', osId);
  }

  async listarPorProduto(produtoId: string): Promise<MovimentacaoEstoque[]> {
    return this.consultarIndice(INDICES_DYNAMO.movimentacoesPorProduto, 'produtoId', produtoId);
  }

  private async consultarIndice(
    IndexName: string,
    atributo: string,
    valor: string,
  ): Promise<MovimentacaoEstoque[]> {
    const itens = await escanearTudo(
      this.client,
      (ExclusiveStartKey) =>
        new QueryCommand({
          TableName: this.tabelas.movimentacoesEstoque,
          IndexName,
          KeyConditionExpression: '#k = :v',
          ExpressionAttributeNames: { '#k': atributo },
          ExpressionAttributeValues: { ':v': valor },
          ExclusiveStartKey,
        }),
    );
    return itens.map(
      (i) => ({ osId: null, servicoId: null, ...i }) as unknown as MovimentacaoEstoque,
    );
  }

  /** Mapeia `CancellationReasons` (mesma ordem de TransactItems) para erros de dominio. */
  private traduzirCancelamento(e: unknown, deltas: [string, number][]): unknown {
    if (!(e instanceof TransactionCanceledException)) return e;
    const motivos = e.CancellationReasons ?? [];
    const emFalta: ItemEmFalta[] = [];
    for (let i = 0; i < deltas.length; i++) {
      if (motivos[i]?.Code !== 'ConditionalCheckFailed') continue;
      const [produtoId, delta] = deltas[i];
      const saldo = motivos[i].Item?.quantidadeEstoque?.N;
      if (!motivos[i].Item) return new ProdutoNaoEncontradoError(produtoId);
      emFalta.push({
        produtoId,
        solicitado: -delta,
        disponivel: saldo === undefined ? null : Number(saldo),
      });
    }
    return emFalta.length ? new EstoqueInsuficienteError(emFalta) : e;
  }
}
