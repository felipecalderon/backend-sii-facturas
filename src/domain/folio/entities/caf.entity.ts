import { TipoDte } from '../../dte/values/dte-type.vo.js';
import { Rut } from '../../shared/rut.vo.js';
import {
  FoliosExhaustedError,
  InvalidCafXmlError,
  InvalidFolioSequenceError
} from '../errors/folio-domain.error.js';

export interface CafProps {
  id?: string;
  tenantId: string;
  tipoDte: TipoDte;
  rangoDesde: number;
  rangoHasta: number;
  ultimoFolioAsignado?: number;
  clavePrivadaPem: string;
  cafXml: string;
  fechaAutorizacion: Date;
  rutEmisor: Rut;
  activo?: boolean;
}

export class Caf {
  public readonly id?: string;
  public readonly tenantId: string;
  public readonly tipoDte: TipoDte;
  public readonly rangoDesde: number;
  public readonly rangoHasta: number;
  private _ultimoFolioAsignado: number;
  public readonly clavePrivadaPem: string;
  public readonly cafXml: string;
  public readonly fechaAutorizacion: Date;
  public readonly rutEmisor: Rut;
  private _activo: boolean;

  private constructor(props: CafProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.tipoDte = props.tipoDte;
    this.rangoDesde = props.rangoDesde;
    this.rangoHasta = props.rangoHasta;
    this._ultimoFolioAsignado =
      props.ultimoFolioAsignado ?? props.rangoDesde - 1;
    this.clavePrivadaPem = props.clavePrivadaPem;
    this.cafXml = props.cafXml;
    this.fechaAutorizacion = props.fechaAutorizacion;
    this.rutEmisor = props.rutEmisor;
    this._activo = props.activo ?? true;
  }

  public static create(props: CafProps): Caf {
    if (!props.tenantId || props.tenantId.trim().length === 0) {
      throw new InvalidCafXmlError('El tenantId es obligatorio para el CAF');
    }
    if (!props.rangoDesde || props.rangoDesde <= 0) {
      throw new InvalidCafXmlError(
        'El rango desde (D) debe ser un entero positivo mayor a 0'
      );
    }
    if (!props.rangoHasta || props.rangoHasta <= 0) {
      throw new InvalidCafXmlError(
        'El rango hasta (H) debe ser un entero positivo mayor a 0'
      );
    }
    if (props.rangoDesde > props.rangoHasta) {
      throw new InvalidCafXmlError(
        `Rango inválido: desde (${props.rangoDesde}) no puede ser mayor que hasta (${props.rangoHasta})`
      );
    }
    if (
      !props.clavePrivadaPem ||
      !props.clavePrivadaPem.includes('PRIVATE KEY')
    ) {
      throw new InvalidCafXmlError(
        'La clave privada RSA PEM es obligatoria y debe ser válida'
      );
    }
    if (!props.cafXml || props.cafXml.trim().length === 0) {
      throw new InvalidCafXmlError('El XML del nodo CAF es obligatorio');
    }

    const initialLastFolio = props.ultimoFolioAsignado ?? props.rangoDesde - 1;
    if (
      initialLastFolio < props.rangoDesde - 1 ||
      initialLastFolio > props.rangoHasta
    ) {
      throw new InvalidFolioSequenceError(
        `El último folio asignado (${initialLastFolio}) está fuera del rango [${props.rangoDesde}, ${props.rangoHasta}]`
      );
    }

    return new Caf(props);
  }

  public hasAvailableFolios(): boolean {
    return this._activo && this._ultimoFolioAsignado < this.rangoHasta;
  }

  public getNextAvailableFolio(): number {
    if (!this.hasAvailableFolios()) {
      throw new FoliosExhaustedError(
        this.tenantId,
        this.tipoDte.code,
        this.rangoHasta
      );
    }
    return this._ultimoFolioAsignado + 1;
  }

  public allocateNextFolio(): number {
    const nextFolio = this.getNextAvailableFolio();
    this._ultimoFolioAsignado = nextFolio;
    if (this._ultimoFolioAsignado === this.rangoHasta) {
      this._activo = false;
    }
    return nextFolio;
  }

  public get ultimoFolioAsignado(): number {
    return this._ultimoFolioAsignado;
  }

  public get activo(): boolean {
    return this._activo;
  }

  public getAvailableCount(): number {
    if (!this._activo || this._ultimoFolioAsignado >= this.rangoHasta) {
      return 0;
    }
    return this.rangoHasta - this._ultimoFolioAsignado;
  }

  public deactivate(): void {
    this._activo = false;
  }
}
