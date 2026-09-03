import { describe, it, expect } from 'vitest';
import { Money } from './money.vo.js';
import { InvalidMoneyError } from '../dte/errors/fiscal-domain.error.js';

describe('Money Value Object', () => {
  it('debe instanciar dinero desde un entero CLP', () => {
    const money = Money.fromInteger(1500);
    expect(money.toClpInteger()).toBe(1500);
    expect(money.currency).toBe('CLP');
  });

  it('debe parsear decimales sin error de coma flotante', () => {
    const money = Money.fromDecimal('100.5500');
    expect(money.toDecimalString(2)).toBe('100.55');
    expect(money.toDecimalString(4)).toBe('100.5500');
  });

  it('debe sumar y restar correctamente preservando precisión', () => {
    const m1 = Money.fromDecimal('10.1234');
    const m2 = Money.fromDecimal('5.8766');
    const sum = m1.add(m2);
    expect(sum.toDecimalString(4)).toBe('16.0000');

    const diff = m1.subtract(m2);
    expect(diff.toDecimalString(4)).toBe('4.2468');
  });

  it('debe multiplicar factores con redondeo half-up para CLP', () => {
    const net = Money.fromInteger(100);
    // 19% IVA = 19 CLP
    const iva = net.multiply('0.19');
    expect(iva.toClpInteger()).toBe(19);

    // 100 * 0.195 = 19.5 -> redondeo a 20
    const roundedUp = net.multiply('0.195');
    expect(roundedUp.toClpInteger()).toBe(20);

    // 100 * 0.194 = 19.4 -> redondeo a 19
    const roundedDown = net.multiply('0.194');
    expect(roundedDown.toClpInteger()).toBe(19);
  });

  it('debe rechazar operaciones entre distintas monedas', () => {
    const clp = Money.fromInteger(100, 'CLP');
    const usd = Money.fromInteger(100, 'USD');

    expect(() => clp.add(usd)).toThrow(InvalidMoneyError);
    expect(() => clp.subtract(usd)).toThrow(InvalidMoneyError);
  });

  it('debe rechazar cadenas que no representen números decimales válidos', () => {
    expect(() => Money.fromDecimal('abc')).toThrow(InvalidMoneyError);
    expect(() => Money.fromDecimal('12.34.56')).toThrow(InvalidMoneyError);
  });

  it('debe comparar montos correctamente', () => {
    const m1 = Money.fromInteger(100);
    const m2 = Money.fromInteger(200);
    const m3 = Money.fromInteger(100);

    expect(m2.isGreaterThan(m1)).toBe(true);
    expect(m1.isLessThan(m2)).toBe(true);
    expect(m1.equals(m3)).toBe(true);
    expect(Money.zero().isZero()).toBe(true);
  });
});
