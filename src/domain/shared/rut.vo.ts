import { InvalidRutError } from '../dte/errors/fiscal-domain.error.js';

export class Rut {
  public readonly body: number;
  public readonly dv: string;
  public readonly value: string; // Canonical format: e.g. "76123456-7"

  private constructor(body: number, dv: string) {
    this.body = body;
    this.dv = dv;
    this.value = `${body}-${dv}`;
  }

  public static of(rawInput: string): Rut {
    if (!rawInput || typeof rawInput !== 'string') {
      throw new InvalidRutError(
        String(rawInput),
        'El valor proporcionado no es un texto'
      );
    }

    const cleaned = rawInput.replace(/\./g, '').trim().toUpperCase();
    const match = cleaned.match(/^(\d{1,8})-?([\dK])$/);

    if (!match) {
      throw new InvalidRutError(
        rawInput,
        'Formato inválido. Debe contener entre 7 y 9 caracteres'
      );
    }

    const bodyStr = match[1];
    const dv = match[2];
    const body = parseInt(bodyStr, 10);

    if (body <= 0) {
      throw new InvalidRutError(
        rawInput,
        'El cuerpo del RUT debe ser mayor a 0'
      );
    }

    const expectedDv = Rut.calculateDv(body);
    if (dv !== expectedDv) {
      throw new InvalidRutError(
        rawInput,
        `Dígito verificador esperado '${expectedDv}', recibido '${dv}'`
      );
    }

    return new Rut(body, dv);
  }

  public static calculateDv(body: number): string {
    let sum = 0;
    let multiplier = 2;
    let currentBody = body;

    while (currentBody > 0) {
      const digit = currentBody % 10;
      sum += digit * multiplier;
      currentBody = Math.floor(currentBody / 10);
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const remainder = sum % 11;
    const result = 11 - remainder;

    if (result === 11) {
      return '0';
    }
    if (result === 10) {
      return 'K';
    }
    return result.toString();
  }

  public toCanonical(): string {
    return this.value;
  }

  public toFormatted(): string {
    const bodyStr = this.body.toString();
    const formattedBody = bodyStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formattedBody}-${this.dv}`;
  }

  public equals(other: Rut): boolean {
    return this.value === other.value;
  }
}
