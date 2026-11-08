/**
 * Nomes das tabelas DynamoDB deste servico. As tabelas sao criadas fora da
 * aplicacao (Terraform no repo infra-db; `npm run dynamodb:create-tables` em
 * dev/testes) — aqui so lemos os nomes do ambiente.
 *
 * Nome = `DYNAMODB_TABLE_PREFIX` + nome base; `DYNAMODB_TABLE_<TABELA>`
 * sobrescreve o nome completo de uma tabela especifica.
 */
export interface TabelasDynamo {
  readonly execucoes: string;
  readonly servicos: string;
  readonly produtos: string;
  readonly movimentacoesEstoque: string;
}

export const TABELAS_DYNAMO = Symbol('TABELAS_DYNAMO');

const BASES: Record<keyof TabelasDynamo, { base: string; override: string }> = {
  execucoes: { base: 'execucoes', override: 'DYNAMODB_TABLE_EXECUCOES' },
  servicos: { base: 'servicos', override: 'DYNAMODB_TABLE_SERVICOS' },
  produtos: { base: 'produtos', override: 'DYNAMODB_TABLE_PRODUTOS' },
  movimentacoesEstoque: {
    base: 'movimentacoes_estoque',
    override: 'DYNAMODB_TABLE_MOVIMENTACOES_ESTOQUE',
  },
};

/** GSIs usados pela aplicacao (o Terraform precisa cria-los com estes nomes). */
export const INDICES_DYNAMO = {
  movimentacoesPorProduto: 'produtoId-data-index',
  movimentacoesPorOs: 'osId-data-index',
} as const;

export function resolverTabelasDynamo(env: NodeJS.ProcessEnv = process.env): TabelasDynamo {
  const prefixo = env.DYNAMODB_TABLE_PREFIX ?? '';
  const entradas = Object.entries(BASES).map(([chave, { base, override }]) => [
    chave,
    env[override] || `${prefixo}${base}`,
  ]);
  return Object.fromEntries(entradas) as unknown as TabelasDynamo;
}
