import { exigirQuantidade, exigirTexto } from '../../shared/domain/validacoes';
import { MovimentacaoEstoque, TipoMovimentacao, deltaDoSaldo } from './movimentacao-estoque';
import { Produto } from './produto.entity';
import { EstoqueInsuficienteError, ItemEmFalta } from './errors/estoque-insuficiente.error';
import { ProdutoNaoEncontradoError } from './errors/produto-nao-encontrado.error';

/** Peca requisitada por um servico de uma OS. */
export interface ItemDeBaixa {
  produtoId: string;
  servicoId: string;
  quantidade: number;
}

type GeradorDeId = () => string;

/** Soma as quantidades por produto (o mesmo produto pode atender varios servicos). */
export function consolidarPorProduto(
  movimentacoes: Pick<MovimentacaoEstoque, 'produtoId' | 'tipo' | 'quantidade'>[],
): Map<string, number> {
  const total = new Map<string, number>();
  for (const m of movimentacoes) {
    total.set(m.produtoId, (total.get(m.produtoId) ?? 0) + deltaDoSaldo(m));
  }
  return total;
}

/**
 * Valida o saldo (produto existe e cobre a soma pedida por todos os servicos)
 * antes de tocar o banco. A garantia final contra corrida e a
 * `ConditionExpression` da transacao — esta checagem so da a mensagem clara.
 */
export function validarSaldo(itens: ItemDeBaixa[], produtos: Map<string, Produto>): void {
  const pedido = new Map<string, number>();
  for (const item of itens) {
    pedido.set(item.produtoId, (pedido.get(item.produtoId) ?? 0) + item.quantidade);
  }
  const emFalta: ItemEmFalta[] = [];
  for (const [produtoId, quantidade] of pedido) {
    const produto = produtos.get(produtoId);
    if (!produto) throw new ProdutoNaoEncontradoError(produtoId);
    if (!produto.possuiSaldo(quantidade)) {
      emFalta.push({ produtoId, solicitado: quantidade, disponivel: produto.quantidadeEstoque });
    }
  }
  if (emFalta.length) throw new EstoqueInsuficienteError(emFalta);
}

/** Uma movimentacao BAIXA por (produto, servico), para rastrear qual servico consumiu a peca. */
export function planejarBaixa(
  osId: string,
  itens: ItemDeBaixa[],
  gerarId: GeradorDeId,
  agora: Date = new Date(),
): MovimentacaoEstoque[] {
  exigirTexto(osId, 'osId');
  const agrupado = new Map<string, ItemDeBaixa>();
  for (const item of itens) {
    exigirQuantidade(item.quantidade, 'quantidade');
    const chave = `${item.produtoId}|${item.servicoId}`;
    const atual = agrupado.get(chave);
    agrupado.set(chave, { ...item, quantidade: (atual?.quantidade ?? 0) + item.quantidade });
  }
  const data = agora.toISOString();
  return [...agrupado.values()].map((item) => ({
    movimentacaoId: gerarId(),
    produtoId: item.produtoId,
    tipo: TipoMovimentacao.BAIXA,
    quantidade: item.quantidade,
    osId,
    servicoId: item.servicoId,
    data,
  }));
}

/**
 * Devolucao (rollback) a partir do historico da OS: para cada (produto,
 * servico), devolve o liquido ainda baixado (BAIXA - DEVOLUCAO). Idempotente:
 * rodar de novo depois de uma devolucao completa nao gera movimentacoes.
 */
export function planejarDevolucao(
  osId: string,
  historico: MovimentacaoEstoque[],
  gerarId: GeradorDeId,
  agora: Date = new Date(),
): MovimentacaoEstoque[] {
  const liquido = new Map<string, { produtoId: string; servicoId: string | null; qtd: number }>();
  for (const m of historico) {
    if (m.osId !== osId || m.tipo === TipoMovimentacao.ENTRADA) continue;
    const chave = `${m.produtoId}|${m.servicoId ?? ''}`;
    const atual = liquido.get(chave) ?? { produtoId: m.produtoId, servicoId: m.servicoId, qtd: 0 };
    atual.qtd += m.tipo === TipoMovimentacao.BAIXA ? m.quantidade : -m.quantidade;
    liquido.set(chave, atual);
  }
  const data = agora.toISOString();
  return [...liquido.values()]
    .filter((l) => l.qtd > 0)
    .map((l) => ({
      movimentacaoId: gerarId(),
      produtoId: l.produtoId,
      tipo: TipoMovimentacao.DEVOLUCAO,
      quantidade: l.qtd,
      osId,
      servicoId: l.servicoId,
      data,
    }));
}
