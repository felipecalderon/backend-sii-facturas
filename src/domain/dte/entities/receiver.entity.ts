import { Rut } from '../../shared/rut.vo.js';
import { FiscalValidationError } from '../errors/fiscal-domain.error.js';

export interface ReceiverProps {
  rut: Rut;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
  ciudad?: string;
  correo?: string;
  contacto?: string;
}

export class Receiver {
  public readonly rut: Rut;
  public readonly razonSocial: string;
  public readonly giro: string;
  public readonly direccion: string;
  public readonly comuna: string;
  public readonly ciudad?: string;
  public readonly correo?: string;
  public readonly contacto?: string;

  private constructor(props: ReceiverProps) {
    this.rut = props.rut;
    this.razonSocial = props.razonSocial;
    this.giro = props.giro;
    this.direccion = props.direccion;
    this.comuna = props.comuna;
    this.ciudad = props.ciudad;
    this.correo = props.correo;
    this.contacto = props.contacto;
  }

  public static create(props: ReceiverProps): Receiver {
    if (!props.razonSocial || props.razonSocial.trim().length === 0) {
      throw new FiscalValidationError(
        'La razón social del receptor es obligatoria'
      );
    }
    if (props.razonSocial.length > 100) {
      throw new FiscalValidationError(
        'La razón social del receptor no puede exceder 100 caracteres'
      );
    }

    if (!props.giro || props.giro.trim().length === 0) {
      throw new FiscalValidationError('El giro del receptor es obligatorio');
    }
    if (props.giro.length > 40) {
      throw new FiscalValidationError(
        'El giro del receptor no puede exceder 40 caracteres'
      );
    }

    if (!props.direccion || props.direccion.trim().length === 0) {
      throw new FiscalValidationError(
        'La dirección del receptor es obligatoria'
      );
    }
    if (props.direccion.length > 60) {
      throw new FiscalValidationError(
        'La dirección del receptor no puede exceder 60 caracteres'
      );
    }

    if (!props.comuna || props.comuna.trim().length === 0) {
      throw new FiscalValidationError('La comuna del receptor es obligatoria');
    }
    if (props.comuna.length > 20) {
      throw new FiscalValidationError(
        'La comuna del receptor no puede exceder 20 caracteres'
      );
    }

    return new Receiver(props);
  }
}
