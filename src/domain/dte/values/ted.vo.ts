import { FiscalValidationError } from '../errors/fiscal-domain.error.js';

export interface TedProps {
  rawXml: string;
  ddXml: string;
  tsted: string;
  signature: string;
  algoritmo?: string;
}

export class Ted {
  public readonly rawXml: string;
  public readonly ddXml: string;
  public readonly tsted: string;
  public readonly signature: string;
  public readonly algoritmo: string;

  private constructor(props: TedProps) {
    this.rawXml = props.rawXml;
    this.ddXml = props.ddXml;
    this.tsted = props.tsted;
    this.signature = props.signature;
    this.algoritmo = props.algoritmo ?? 'SHA1withRSA';
  }

  public static create(props: TedProps): Ted {
    if (!props.rawXml || !props.rawXml.includes('<TED')) {
      throw new FiscalValidationError('El XML del TED debe contener la etiqueta <TED>');
    }
    if (!props.ddXml || !props.ddXml.includes('<DD')) {
      throw new FiscalValidationError('El nodo <DD> es obligatorio en el TED');
    }
    if (!props.signature || props.signature.trim().length === 0) {
      throw new FiscalValidationError('La firma digital <FRMT> es obligatoria en el TED');
    }
    if (!props.tsted || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(props.tsted)) {
      throw new FiscalValidationError(
        `Formato inválido de timestamp TSTED: "${props.tsted}". Debe ser YYYY-MM-DDTHH:mm:ss`,
      );
    }

    return new Ted(props);
  }
}
