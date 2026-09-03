import { FiscalValidationError } from '../errors/fiscal-domain.error.js';

export enum TipoDteEnum {
  FACTURA_ELECTRONICA = 33,
  FACTURA_EXENTA_ELECTRONICA = 34,
  GUIA_DESPACHO_ELECTRONICA = 52,
  NOTA_DEBITO_ELECTRONICA = 56,
  NOTA_CREDITO_ELECTRONICA = 61
}

export class TipoDte {
  private constructor(public readonly code: TipoDteEnum) {}

  public static of(code: number): TipoDte {
    if (!Object.values(TipoDteEnum).includes(code as TipoDteEnum)) {
      throw new FiscalValidationError(
        `Tipo de DTE no soportado o inválido: ${code}`
      );
    }
    return new TipoDte(code as TipoDteEnum);
  }

  public static facturaElectronica(): TipoDte {
    return new TipoDte(TipoDteEnum.FACTURA_ELECTRONICA);
  }

  public isFacturaElectronica(): boolean {
    return this.code === TipoDteEnum.FACTURA_ELECTRONICA;
  }

  public requiresIva(): boolean {
    return this.code === TipoDteEnum.FACTURA_ELECTRONICA;
  }
}
