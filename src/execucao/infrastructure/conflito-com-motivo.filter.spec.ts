import { ConflitoComMotivoFilter } from './conflito-com-motivo.filter';
import { ConflitoDeNegocioError, DadoInvalidoError } from '../../shared/domain/erros-de-dominio';

function host() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return {
    json,
    status,
    h: { switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({}) }) },
  };
}

describe('ConflitoComMotivoFilter', () => {
  it('409 com `motivo` (contrato http-interno)', () => {
    const { h, status, json } = host();
    new ConflitoComMotivoFilter().catch(new ConflitoDeNegocioError('sem estoque'), h as never);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, motivo: 'sem estoque', message: 'sem estoque' }),
    );
  });

  it('demais erros seguem o filtro do kit', () => {
    const { h, status } = host();
    new ConflitoComMotivoFilter().catch(new DadoInvalidoError('x'), h as never);
    expect(status).toHaveBeenCalledWith(400);
  });
});
