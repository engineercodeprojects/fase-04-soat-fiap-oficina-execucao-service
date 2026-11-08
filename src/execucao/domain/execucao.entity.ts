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
  veiculoId: string;
  descricaoProblema: string | null;
  mecanicoId: string | null;
  status: StatusExecucao;
  diagnostico: string | null;
  servicos: ServicoDaExecucao[];
  estoqueBaixado: boolean;
  finalizadaEm: string | null;
  createdAt: string;
  updatedAt: string;
  versao: number;
}

/** Item do orcamento no formato do callback `execucao.diagnostico-concluido` (contrato do OS). */
export interface ItemDiagnostico {
  tipo: 'SERVICO' | 'PRODUTO';
  referenciaId: string;
  nome: string;
  quantidade: number;
  precoUnitario: string;
  servicoId?: string;
}

export interface ItemDeEstoqueDaExecucao {
  produtoId: string;
  servicoId: string;
  quantidade: number;
}

const STATUS_CANCELAVEIS = [
  StatusExecucao.NA_FILA,
  StatusExecucao.ATRIBUIDA,
  StatusExecucao.EM_DIAGNOSTICO,
  StatusExecucao.AGUARDANDO_APROVACAO,
];

/**
 * Agregado Execucao (1 por OS): fila, mecanico responsavel, servicos+pecas do
 * diagnostico e o ciclo de vida da execucao. Toda mudanca de status passa por
 * `transitarPara`, que aplica a maquina de estados.
 */
export class Execucao {
  private constructor(private props: ExecucaoProps) {}

  /** `execucao.enfileirar` do OS Service: a OS entra na fila, ainda sem mecanico. */
  static enfileirar(
    input: { osId: string; veiculoId: string; descricaoProblema?: string },
    agora: Date = new Date(),
  ): Execucao {
    const iso = agora.toISOString();
    return new Execucao({
      osId: exigirTexto(input.osId, 'numeroOS'),
      veiculoId: exigirTexto(input.veiculoId, 'veiculoId'),
      descricaoProblema: input.descricaoProblema?.trim() || null,
      mecanicoId: null,
      status: StatusExecucao.NA_FILA,
      diagnostico: null,
      servicos: [],
      estoqueBaixado: false,
      finalizadaEm: null,
      createdAt: iso,
      updatedAt: iso,
      versao: 0,
    });
  }

  static reconstituir(props: ExecucaoProps): Execucao {
    return new Execucao(structuredClone(props));
  }

  /** Atribui (NA_FILA -> ATRIBUIDA) ou troca o mecanico enquanto o diagnostico esta aberto. */
  atribuirMecanico(mecanicoId: string, agora: Date = new Date()): void {
    const id = exigirTexto(mecanicoId, 'mecanicoId');
    if (this.props.status === StatusExecucao.NA_FILA) {
      this.transitarPara(StatusExecucao.ATRIBUIDA, agora);
    } else if (!emDiagnostico(this.props.status)) {
      throw new ConflitoDeNegocioError(
        `Nao e possivel atribuir mecanico com a execucao em ${this.props.status}`,
      );
    }
    this.props.mecanicoId = id;
    this.tocar(agora);
  }

  /** Vincula servico do catalogo; o primeiro vinculo inicia o diagnostico (ATRIBUIDA -> EM_DIAGNOSTICO). */
  adicionarServico(
    servico: Omit<ServicoDaExecucao, 'produtos'>,
    agora: Date = new Date(),
  ): boolean {
    this.exigirDiagnosticoAberto();
    if (this.props.servicos.some((s) => s.servicoId === servico.servicoId)) return false;
    if (this.props.status === StatusExecucao.ATRIBUIDA) {
      this.transitarPara(StatusExecucao.EM_DIAGNOSTICO, agora);
    }
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

  /** Conclui o diagnostico (-> AGUARDANDO_APROVACAO). Devolve as pecas a baixar. */
  concluirDiagnostico(diagnostico: string, agora: Date = new Date()): ItemDeEstoqueDaExecucao[] {
    if (!this.props.servicos.length) {
      throw new DadoInvalidoError('Diagnostico sem servicos: vincule ao menos um servico a OS');
    }
    const texto = exigirTexto(diagnostico, 'diagnostico');
    this.transitarPara(StatusExecucao.AGUARDANDO_APROVACAO, agora);
    this.props.diagnostico = texto;
    this.props.estoqueBaixado = true;
    return this.itensDeEstoque();
  }

  /** `execucao.iniciar` (orcamento aprovado). Idempotente: false se ja estava em execucao/executada. */
  iniciarExecucao(agora: Date = new Date()): boolean {
    if (
      this.props.status === StatusExecucao.EM_EXECUCAO ||
      this.props.status === StatusExecucao.EXECUTADA
    ) {
      return false;
    }
    this.transitarPara(StatusExecucao.EM_EXECUCAO, agora);
    return true;
  }

  finalizar(agora: Date = new Date()): void {
    this.transitarPara(StatusExecucao.EXECUTADA, agora);
    this.props.finalizadaEm = agora.toISOString();
  }

  /** `execucao.liberar-reservas` (OS cancelada/orcamento reprovado). Idempotente. */
  cancelar(agora: Date = new Date()): boolean {
    if (this.props.status === StatusExecucao.CANCELADA) return false;
    if (!STATUS_CANCELAVEIS.includes(this.props.status)) {
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

  itensDeEstoque(): ItemDeEstoqueDaExecucao[] {
    return this.props.servicos.flatMap((s) =>
      s.produtos.map((p) => ({
        produtoId: p.produtoId,
        servicoId: s.servicoId,
        quantidade: p.quantidade,
      })),
    );
  }

  /** Itens com precos congelados no formato do OS Service (servicos e, sob cada um, as pecas). */
  itensDoDiagnostico(): ItemDiagnostico[] {
    return this.props.servicos.flatMap((s) => [
      {
        tipo: 'SERVICO' as const,
        referenciaId: s.servicoId,
        nome: s.nome,
        quantidade: 1,
        precoUnitario: s.preco.toFixed(2),
      },
      ...s.produtos.map((p) => ({
        tipo: 'PRODUTO' as const,
        referenciaId: p.produtoId,
        nome: p.nome,
        quantidade: p.quantidade,
        precoUnitario: p.precoUnitario.toFixed(2),
        servicoId: s.servicoId,
      })),
    ]);
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
  get veiculoId() {
    return this.props.veiculoId;
  }
  get mecanicoId() {
    return this.props.mecanicoId;
  }
  get status() {
    return this.props.status;
  }
  get diagnostico() {
    return this.props.diagnostico;
  }
  get finalizadaEm() {
    return this.props.finalizadaEm;
  }
  get createdAt() {
    return this.props.createdAt;
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
