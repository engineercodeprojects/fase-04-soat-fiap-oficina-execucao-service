import { DadoInvalidoError } from './erros-de-dominio';

export function exigirTexto(valor: string | undefined | null, campo: string): string {
  const texto = (valor ?? '').trim();
  if (!texto) throw new DadoInvalidoError(`${campo} e obrigatorio`);
  return texto;
}

export function exigirPreco(valor: number, campo: string): number {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new DadoInvalidoError(`${campo} deve ser um numero maior ou igual a zero`);
  }
  return Math.round(valor * 100) / 100;
}

export function exigirQuantidade(valor: number, campo: string, minimo = 1): number {
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new DadoInvalidoError(`${campo} deve ser um inteiro maior ou igual a ${minimo}`);
  }
  return valor;
}
