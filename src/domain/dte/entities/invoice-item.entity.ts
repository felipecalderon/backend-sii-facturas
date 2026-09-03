import { Money } from '../../shared/money.vo.js';
import { FiscalValidationError } from '../errors/fiscal-domain.error.js';

export interface InvoiceItemProps {
  linea: number;
  nombre: string;
  descripcion?: string;
  cantidad: Money;
  precioUnitario: Money;
  esExento?: boolean;
  descuentoPct?: number; // Porcentaje entre 0 y 100
  descuentoMonto?: Money;
}

export class InvoiceItem {
  public readonly linea: number;
  public readonly nombre: string;
  public readonly descripcion?: string;
  public readonly cantidad: Money;
  public readonly precioUnitario: Money;
  public readonly esExento: boolean;
  public readonly descuentoPct?: number;
  public readonly descuentoMonto: Money;
  public readonly subtotal: Money; // (cantidad * precioUnitario) - descuento

  private constructor(
    props: InvoiceItemProps,
    subtotal: Money,
    descuentoMonto: Money
  ) {
    this.linea = props.linea;
    this.nombre = props.nombre;
    this.descripcion = props.descripcion;
    this.cantidad = props.cantidad;
    this.precioUnitario = props.precioUnitario;
    this.esExento = props.esExento ?? false;
    this.descuentoPct = props.descuentoPct;
    this.descuentoMonto = descuentoMonto;
    this.subtotal = subtotal;
  }

  public static create(props: InvoiceItemProps): InvoiceItem {
    if (props.linea <= 0) {
      throw new FiscalValidationError('El número de línea debe ser mayor a 0');
    }
    if (!props.nombre || props.nombre.trim().length === 0) {
      throw new FiscalValidationError('El nombre del ítem es obligatorio');
    }
    if (props.nombre.length > 80) {
      throw new FiscalValidationError(
        'El nombre del ítem no puede exceder 80 caracteres'
      );
    }
    if (props.descripcion && props.descripcion.length > 1000) {
      throw new FiscalValidationError(
        'La descripción no puede exceder 1000 caracteres'
      );
    }
    if (props.cantidad.isNegative() || props.cantidad.isZero()) {
      throw new FiscalValidationError('La cantidad debe ser mayor a cero');
    }
    if (props.precioUnitario.isNegative()) {
      throw new FiscalValidationError(
        'El precio unitario no puede ser negativo'
      );
    }

    // Calcular monto bruto de línea: cantidad * precioUnitario
    // cantidad se escala a decimal para multiplicar precioUnitario
    const grossAmount = props.precioUnitario.multiply(
      props.cantidad.toDecimalString(6)
    );

    let discount = Money.zero(props.precioUnitario.currency);
    if (props.descuentoMonto) {
      if (props.descuentoMonto.isNegative()) {
        throw new FiscalValidationError(
          'El monto de descuento no puede ser negativo'
        );
      }
      discount = props.descuentoMonto;
    } else if (props.descuentoPct !== undefined) {
      if (props.descuentoPct < 0 || props.descuentoPct > 100) {
        throw new FiscalValidationError(
          'El porcentaje de descuento debe estar entre 0 y 100'
        );
      }
      const pctFactor = (props.descuentoPct / 100).toString();
      discount = grossAmount.multiply(pctFactor);
    }

    if (discount.isGreaterThan(grossAmount)) {
      throw new FiscalValidationError(
        'El descuento no puede ser superior al subtotal de la línea'
      );
    }

    const netLine = grossAmount.subtract(discount);

    return new InvoiceItem(props, netLine, discount);
  }

  public getMontoItemClp(): number {
    return this.subtotal.toClpInteger();
  }
}
