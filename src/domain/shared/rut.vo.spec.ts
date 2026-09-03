import { describe, it, expect } from 'vitest';
import { Rut } from './rut.vo.js';
import { InvalidRutError } from '../dte/errors/fiscal-domain.error.js';

describe('Rut Value Object', () => {
  it('debe validar y crear RUTs chilenos válidos', () => {
    const r1 = Rut.of('76123456-0');
    expect(r1.body).toBe(76123456);
    expect(r1.dv).toBe('0');
    expect(r1.toCanonical()).toBe('76123456-0');

    const r2 = Rut.of('6-K');
    expect(r2.body).toBe(6);
    expect(r2.dv).toBe('K');
    expect(r2.toCanonical()).toBe('6-K');
  });

  it('debe normalizar RUTs con puntos y minúsculas', () => {
    const rut = Rut.of('76.123.456-0');
    expect(rut.toCanonical()).toBe('76123456-0');
    expect(rut.toFormatted()).toBe('76.123.456-0');

    const rutK = Rut.of('6-k');
    expect(rutK.dv).toBe('K');
  });

  it('debe rechazar RUT con dígito verificador incorrecto', () => {
    expect(() => Rut.of('76123456-9')).toThrow(InvalidRutError);
    expect(() => Rut.of('6-0')).toThrow(InvalidRutError);
  });

  it('debe rechazar formatos inválidos o valores no numéricos', () => {
    expect(() => Rut.of('abc-1')).toThrow(InvalidRutError);
    expect(() => Rut.of('')).toThrow(InvalidRutError);
    expect(() => Rut.of('1234567890-1')).toThrow(InvalidRutError);
  });
});
