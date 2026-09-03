import { Money } from '../../shared/money.vo.js';
import {
  FiscalCalculationMismatchError,
  FiscalValidationError
} from '../errors/fiscal-domain.error.js';
import { InvoiceItem } from '../entities/invoice-item.entity.js';

export interface InvoiceTotalsProps {
  montoNeto: Money;
  montoExento: Money;
  tasaIva: number;
  montoIva: Money;
  montoTotal: Money;
}

export class InvoiceTotals {
  public readonly montoNeto: Money;
  public readonly montoExento: Money;
  public readonly tasaIva: number;
  public readonly montoIva: Money;
  public readonly montoTotal: Money;

  private constructor(props: InvoiceTotalsProps) {
    this.montoNeto = props.montoNeto;
    this.montoExento = props.montoExento;
    this.tasaIva = props.tasaIva;
    this.montoIva = props.montoIva;
    this.montoTotal = props.montoTotal;
  }

  public static create(props: InvoiceTotalsProps): InvoiceTotals {
    if (props.tasaIva < 0) {
      throw new FiscalValidationError('La tasa de IVA no puede ser negativa');
    }

    const expectedIvaClp =
      props.montoNeto.isZero() || props.tasaIva === 0
        ? 0
        : props.montoNeto
            .multiply((props.tasaIva / 100).toString())
            .toClpInteger();

    if (props.montoIva.toClpInteger() !== expectedIvaClp) {
      throw new FiscalCalculationMismatchError(
        'montoIva',
        expectedIvaClp,
        props.montoIva.toClpInteger()
      );
    }

    const expectedTotalClp =
      props.montoNeto.toClpInteger() +
      props.montoExento.toClpInteger() +
      props.montoIva.toClpInteger();

    if (props.montoTotal.toClpInteger() !== expectedTotalClp) {
      throw new FiscalCalculationMismatchError(
        'montoTotal',
        expectedTotalClp,
        props.montoTotal.toClpInteger()
      );
    }

    return new InvoiceTotals(props);
  }

  public static calculateFromItems(
    items: InvoiceItem[],
    tasaIva: number = 19,
    currency: string = 'CLP'
  ): InvoiceTotals {
    if (items.length === 0) {
      throw new FiscalValidationError(
        'No se pueden calcular totales sin ítems'
      );
    }

    let netoSum = Money.zero(currency);
    let exentoSum = Money.zero(currency);

    for (const item of items) {
      // In SII DTE 33, each item's subtotal is rounded to CLP integer
      const itemClp = Money.fromInteger(item.getMontoItemClp(), currency);
      if (item.esExento) {
        exentoSum = exentoSum.add(itemClp);
      } else {
        netoSum = netoSum.add(itemClp);
      }
    }

    const ivaCalculated =
      netoSum.isZero() || tasaIva === 0
        ? Money.zero(currency)
        : Money.fromInteger(
            netoSum.multiply((tasaIva / 100).toString()).toClpInteger(),
            currency
          );

    const totalCalculated = netoSum.add(exentoSum).add(ivaCalculated);

    return new InvoiceTotals({
      montoNeto: netoSum,
      montoExento: exentoSum,
      tasaIva,
      montoIva: ivaCalculated,
      montoTotal: totalCalculated
    });
  }

  public getNetoClp(): number {
    return this.montoNeto.toClpInteger();
  }

  public getExentoClp(): number {
    return this.montoExento.toClpInteger();
  }

  public getIvaClp(): number {
    return this.montoIva.toClpInteger();
  }

  public getTotalClp(): number {
    return this.montoTotal.toClpInteger();
  }
}
