import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

type ChaveInicial = Record<string, unknown> | undefined;

/** Percorre todas as paginas de um Scan/Query (LastEvaluatedKey). */
export async function escanearTudo(
  client: DynamoDBDocumentClient,
  comando: (inicio: ChaveInicial) => ScanCommand | QueryCommand,
): Promise<Record<string, unknown>[]> {
  const itens: Record<string, unknown>[] = [];
  let inicio: ChaveInicial;
  do {
    const resposta = await client.send(comando(inicio) as ScanCommand);
    itens.push(...((resposta.Items ?? []) as Record<string, unknown>[]));
    inicio = resposta.LastEvaluatedKey;
  } while (inicio);
  return itens;
}
