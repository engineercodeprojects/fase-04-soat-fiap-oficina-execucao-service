import { ConflitoDeNegocioError, DadoInvalidoError } from '../../shared/domain/erros-de-dominio';
import { exigirQuantidade, exigirTexto } from '../../shared/domain/validacoes';
import { StatusExecucao, emDiagnostico, podeTransitar } from './status-execucao';
import { TransicaoDeStatusInvalidaError } from './errors/transicao-invalida.error';

/** Peca usada por um servico da OS — preco congelado no momento do vinculo. */
export interface ProdutoDaExecucao {
  produtoId: string;
  nome: string;
  sku: string;
  precoUnitario: number;
  quantidade: number;
}

/** Servico vinculado a OS — snapshot do catalogo (nome/preco congelados). */
export interface ServicoDaExecucao {
  servicoId: string;
  nome: string;
  preco: number;
  produtos: ProdutoDaExecucao[];
}

export interface ExecucaoProps {
  osId: string;
  mecanicoId: string;
  status: StatusExecucao;
  servicos: ServicoDaExecucao[];
  estoqueBaixado: boolean;
  createdAt: string;
  updatedAt: string;
  versao: number;
}

const STATUS_ROLLBACK = [
  StatusExecucao.ATRIBUIDA,
  StatusExecucao.EM_DIAGNOSTICO,
  StatusExecucao.AGUARDANDO_APROVACAO,
];

/**
 * Agregado Execucao (1 por OS): mecanico responsavel, servicos+pecas do
 * diagnostico e o ciclo de vida da execucao. Toda mudanca de status passa por
 * `transitarPara`, que aplica a maquina de estados.
 */
export class Execucao {
  private constructor(private props: ExecucaoProps) {}

  static atribuir(osId: string, mecanicoId: string, agora: Date = new Date()): Execucao {
    const iso = agora.toISOString();
    return new Execucao({
      osId: exigirTexto(osId, 'osId'),
      mecanicoId: exigirTexto(mecanicoId, 'mecanicoId'),
      status: StatusExecucao.ATRIBUIDA,
      servicos: [],
      estoqueBaixado: false,
      createdAt: iso,
      updatedAt: iso,
      versao: 0,
    });
  }

  static reconstituir(props: ExecucaoProps): Execucao {
    return new Execucao(structuredClone(props));
  }

  /** Troca o mecanico enquanto o diagnostico nao foi fechado. */
  reatribuirMecanico(mecanicoId: string, agora: Date = new Date()): void {
    if (!emDiagnostico(this.props.status)) {
      throw new ConflitoDeNegocioError(
        `Nao e possivel reatribuir mecanico com a execucao em ${this.props.status}`,
      );
    }
    this.props.mecanicoId = exigirTexto(mecanicoId, 'mecanicoId');
    this.tocar(agora);
  }

  adicionarServico(
    servico: Omit<ServicoDaExecucao, 'produtos'>,
    agora: Date = new Date(),
  ): boolean {
    this.exigirDiagnosticoAberto();
    if (this.props.servicos.some((s) => s.servicoId === servico.servicoId)) return false;
    this.props.servicos.push({ ...servico, produtos: [] });
    this.tocar(agora);
    return true;
  }

  removerServico(servicoId: string, agora: Date = new Date()): void {
    this.exigirDiagnosticoAberto();
    this.servico(servicoId);
    this.props.servicos = this.props.servicos.filter((s) => s.servicoId !== servicoId);
    this.tocar(agora);
  }

  /** Vincula peca a um servico da OS; o mesmo produto pode atender varios servicos. */
  vincularProduto(servicoId: string, produto: ProdutoDaExecucao, agora: Date = new Date()): void {
    this.exigirDiagnosticoAberto();
    exigirQuantidade(produto.quantidade, 'quantidade');
    const servico = this.servico(servicoId);
    const existente = servico.produtos.find((p) => p.produtoId === produto.produtoId);
    if (existente) existente.quantidade += produto.quantidade;
    else servico.produtos.push({ ...produto });
    this.tocar(agora);
  }

  /** Fecha o diagnostico (-> AGUARDANDO_APROVACAO). Devolve as pecas a baixar. */
  fecharDiagnostico(
    agora: Date = new Date(),
  ): { produtoId: string; servicoId: string; quantidade: number }[] {
    if (!this.props.servicos.length) {
      throw new DadoInvalidoError('Diagnostico sem servicos: vincule ao menos um servico a OS');
    }
    this.transitarPara(StatusExecucao.AGUARDANDO_APROVACAO, agora);
    this.props.estoqueBaixado = true;
    return this.itensDeEstoque();
  }

  /** Reprovacao do orcamento. Idempotente: retorna false se ja estava CANCELADA. */
  cancelar(agora: Date = new Date()): boolean {
    if (this.props.status === StatusExecucao.CANCELADA) return false;
    if (!STATUS_ROLLBACK.includes(this.props.status)) {
      throw new TransicaoDeStatusInvalidaError(this.props.status, StatusExecucao.CANCELADA);
    }
    this.transitarPara(StatusExecucao.CANCELADA, agora);
    this.props.estoqueBaixado = false;
    return true;
  }

  transitarPara(novo: StatusExecucao, agora: Date = new Date()): void {
    if (!podeTransitar(this.props.status, novo)) {
      throw new TransicaoDeStatusInvalidaError(this.props.status, novo);
    }
    this.props.status = novo;
    this.tocar(agora);
  }

  itensDeEstoque(): { produtoId: string; servicoId: string; quantidade: number }[] {
    return this.props.servicos.flatMap((s) =>
      s.produtos.map((p) => ({
        produtoId: p.produtoId,
        servicoId: s.servicoId,
        quantidade: p.quantidade,
      })),
    );
  }

  /** Orcamento consolidado: mao de obra + pecas. */
  get valorTotal(): number {
    const total = this.props.servicos.reduce(
      (acc, s) =>
        acc + s.preco + s.produtos.reduce((a, p) => a + p.precoUnitario * p.quantidade, 0),
      0,
    );
    return Math.round(total * 100) / 100;
  }

  get osId() {
    return this.props.osId;
  }
  get mecanicoId() {
    return this.props.mecanicoId;
  }
  get status() {
    return this.props.status;
  }
  get versao() {
    return this.props.versao;
  }
  get servicos(): readonly ServicoDaExecucao[] {
    return this.props.servicos;
  }

  /** Chamado pelo repositorio apos gravar (lock otimista). */
  marcarPersistida(): void {
    this.props.versao += 1;
  }

  toJSON(): ExecucaoProps {
    return structuredClone(this.props);
  }

  private servico(servicoId: string): ServicoDaExecucao {
    const servico = this.props.servicos.find((s) => s.servicoId === servicoId);
    if (!servico) {
      throw new DadoInvalidoError(
        `Servico ${servicoId} nao esta vinculado a OS ${this.props.osId}`,
      );
    }
    return servico;
  }

  private exigirDiagnosticoAberto(): void {
    if (!emDiagnostico(this.props.status)) {
      throw new ConflitoDeNegocioError(
        `Servicos e pecas so podem ser alterados durante o diagnostico (status atual: ${this.props.status})`,
      );
    }
  }

  private tocar(agora: Date): void {
    this.props.updatedAt = agora.toISOString();
  }
}
