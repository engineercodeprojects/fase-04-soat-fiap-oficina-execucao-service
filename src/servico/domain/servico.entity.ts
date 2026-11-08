import { exigirPreco, exigirTexto } from '../../shared/domain/validacoes';

export interface ServicoProps {
  servicoId: string;
  nome: string;
  descricao?: string | null;
  precoBase: number;
  createdAt: string;
  updatedAt: string;
}

/** Item do catalogo de servicos da oficina (ex.: troca de oleo, alinhamento). */
export class Servico {
  private constructor(private props: ServicoProps) {}

  static criar(
    input: { servicoId: string; nome: string; descricao?: string; precoBase: number },
    agora: Date = new Date(),
  ): Servico {
    const iso = agora.toISOString();
    return new Servico({
      servicoId: input.servicoId,
      nome: exigirTexto(input.nome, 'nome'),
      descricao: input.descricao?.trim() || null,
      precoBase: exigirPreco(input.precoBase, 'precoBase'),
      createdAt: iso,
      updatedAt: iso,
    });
  }

  static reconstituir(props: ServicoProps): Servico {
    return new Servico({ ...props });
  }

  atualizar(
    input: { nome?: string; descricao?: string; precoBase?: number },
    agora: Date = new Date(),
  ): void {
    if (input.nome !== undefined) this.props.nome = exigirTexto(input.nome, 'nome');
    if (input.descricao !== undefined) this.props.descricao = input.descricao.trim() || null;
    if (input.precoBase !== undefined)
      this.props.precoBase = exigirPreco(input.precoBase, 'precoBase');
    this.props.updatedAt = agora.toISOString();
  }

  get servicoId() {
    return this.props.servicoId;
  }
  get nome() {
    return this.props.nome;
  }
  get precoBase() {
    return this.props.precoBase;
  }

  toJSON(): ServicoProps {
    return { ...this.props };
  }
}
