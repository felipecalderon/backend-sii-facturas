import { Rut } from '../../shared/rut.vo.js';
import { FiscalValidationError } from '../errors/fiscal-domain.error.js';

export interface IssuerProps {
  rut: Rut;
  razonSocial: string;
  giro: string;
  actividadEconomica: number;
  direccion: string;
  comuna: string;
  ciudad?: string;
  correo?: string;
  telefono?: string;
  fchResol?: string; // Fecha de la resolución de autorización (AAAA-MM-DD)
  nroResol?: number; // Número de la resolución de autorización
}

export class Issuer {
  public readonly rut: Rut;
  public readonly razonSocial: string;
  public readonly giro: string;
  public readonly actividadEconomica: number;
  public readonly direccion: string;
  public readonly comuna: string;
  public readonly ciudad?: string;
  public readonly correo?: string;
  public readonly telefono?: string;
  public readonly fchResol?: string;
  public readonly nroResol?: number;

  private constructor(props: IssuerProps) {
    this.rut = props.rut;
    this.razonSocial = props.razonSocial;
    this.giro = props.giro;
    this.actividadEconomica = props.actividadEconomica;
    this.direccion = props.direccion;
    this.comuna = props.comuna;
    this.ciudad = props.ciudad;
    this.correo = props.correo;
    this.telefono = props.telefono;
    this.fchResol = props.fchResol;
    this.nroResol = props.nroResol;
  }

  public static create(props: IssuerProps): Issuer {
    if (!props.razonSocial || props.razonSocial.trim().length === 0) {
      throw new FiscalValidationError(
        'La razón social del emisor es obligatoria'
      );
    }
    if (props.razonSocial.length > 100) {
      throw new FiscalValidationError(
        'La razón social del emisor no puede exceder 100 caracteres'
      );
    }

    if (!props.giro || props.giro.trim().length === 0) {
      throw new FiscalValidationError('El giro del emisor es obligatorio');
    }
    if (props.giro.length > 80) {
      throw new FiscalValidationError(
        'El giro del emisor no puede exceder 80 caracteres'
      );
    }

    if (!props.actividadEconomica || props.actividadEconomica <= 0) {
      throw new FiscalValidationError(
        'El código de actividad económica (Acteco) debe ser mayor a 0'
      );
    }

    if (!props.direccion || props.direccion.trim().length === 0) {
      throw new FiscalValidationError(
        'La dirección de origen del emisor es obligatoria'
      );
    }
    if (props.direccion.length > 60) {
      throw new FiscalValidationError(
        'La dirección de origen no puede exceder 60 caracteres'
      );
    }

    if (!props.comuna || props.comuna.trim().length === 0) {
      throw new FiscalValidationError(
        'La comuna de origen del emisor es obligatoria'
      );
    }
    if (props.comuna.length > 20) {
      throw new FiscalValidationError(
        'La comuna de origen no puede exceder 20 caracteres'
      );
    }

    if (
      props.fchResol !== undefined &&
      !Issuer.isValidIsoDate(props.fchResol)
    ) {
      throw new FiscalValidationError(
        'La fecha de la resolución de autorización (fchResol) debe tener formato AAAA-MM-DD y ser una fecha válida'
      );
    }

    if (
      props.nroResol !== undefined &&
      (!Number.isInteger(props.nroResol) ||
        props.nroResol < 0 ||
        props.nroResol > 999999)
    ) {
      throw new FiscalValidationError(
        'El número de la resolución de autorización (nroResol) debe ser un entero entre 0 y 999999'
      );
    }

    return new Issuer(props);
  }

  private static isValidIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return false;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }
}
