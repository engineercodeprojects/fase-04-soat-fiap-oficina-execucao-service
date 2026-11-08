import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import { INDICES_DYNAMO, TabelasDynamo } from './tabelas.config';

/**
 * Definicao das tabelas para dev local e testes (DynamoDB Local). Em producao
 * as tabelas sao criadas pelo Terraform do repo infra-db com as MESMAS chaves
 * e GSIs (contrato documentado no README).
 */
export function definicoesTabelas(tabelas: TabelasDynamo): CreateTableCommandInput[] {
  const s = (AttributeName: string) => ({ AttributeName, AttributeType: 'S' as const });
  const hash = (AttributeName: string) => ({ AttributeName, KeyType: 'HASH' as const });
  const range = (AttributeName: string) => ({ AttributeName, KeyType: 'RANGE' as const });
  return [
    {
      TableName: tabelas.execucoes,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [s('osId')],
      KeySchema: [hash('osId')],
    },
    {
      TableName: tabelas.servicos,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [s('servicoId')],
      KeySchema: [hash('servicoId')],
    },
    {
      TableName: tabelas.produtos,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [s('produtoId')],
      KeySchema: [hash('produtoId')],
    },
    {
      TableName: tabelas.movimentacoesEstoque,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [s('movimentacaoId'), s('produtoId'), s('osId'), s('data')],
      KeySchema: [hash('movimentacaoId')],
      GlobalSecondaryIndexes: [
        {
          IndexName: INDICES_DYNAMO.movimentacoesPorProduto,
          KeySchema: [hash('produtoId'), range('data')],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: INDICES_DYNAMO.movimentacoesPorOs,
          KeySchema: [hash('osId'), range('data')],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    },
  ];
}
