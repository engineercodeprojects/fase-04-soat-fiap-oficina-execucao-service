import { ConflitoDeNegocioError } from '../../../shared/domain/erros-de-dominio';

export class SkuDuplicadoError extends ConflitoDeNegocioError {
  constructor(sku: string) {
    super(`Ja existe produto com o SKU ${sku}`);
  }
}
