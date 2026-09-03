import { InvalidMoneyError } from '../dte/errors/fiscal-domain.error.js';

export class Money {
  private static readonly SCALE = 6;
  private static readonly SCALE_FACTOR = 1_000_000n;

  private constructor(
    private readonly scaledAmount: bigint,
    public readonly currency: string = 'CLP'
  ) {}

  public static fromInteger(value: number | bigint, currency = 'CLP'): Money {
    const rawBigInt =
      typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
    return new Money(rawBigInt * Money.SCALE_FACTOR, currency);
  }

  public static fromDecimal(value: number | string, currency = 'CLP'): Money {
    const str = typeof value === 'number' ? value.toString() : value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
      throw new InvalidMoneyError(`Formato decimal inválido: "${value}"`);
    }

    const isNegative = str.startsWith('-');
    const cleanStr = isNegative ? str.slice(1) : str;
    const [integerPart, fractionalPart = ''] = cleanStr.split('.');

    const paddedFraction = fractionalPart
      .padEnd(Money.SCALE, '0')
      .slice(0, Money.SCALE);
    const combinedStr = `${integerPart}${paddedFraction}`;
    let scaled = BigInt(combinedStr);

    if (isNegative) {
      scaled = -scaled;
    }

    return new Money(scaled, currency);
  }

  public static zero(currency = 'CLP'): Money {
    return new Money(0n, currency);
  }

  public add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.scaledAmount + other.scaledAmount, this.currency);
  }

  public subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.scaledAmount - other.scaledAmount, this.currency);
  }

  public multiply(factor: number | string | bigint): Money {
    const factorScaled =
      typeof factor === 'bigint'
        ? factor * Money.SCALE_FACTOR
        : Money.fromDecimal(factor, this.currency).scaledAmount;

    // (scaledAmount * factorScaled) / SCALE_FACTOR with half-up rounding
    const product = this.scaledAmount * factorScaled;
    const isNegative = product < 0n;
    const absProduct = isNegative ? -product : product;
    const half = Money.SCALE_FACTOR / 2n;
    const rounded = (absProduct + half) / Money.SCALE_FACTOR;

    return new Money(isNegative ? -rounded : rounded, this.currency);
  }

  public toClpInteger(): number {
    const isNegative = this.scaledAmount < 0n;
    const abs = isNegative ? -this.scaledAmount : this.scaledAmount;
    const half = Money.SCALE_FACTOR / 2n;
    const rounded = (abs + half) / Money.SCALE_FACTOR;
    const result = isNegative ? -rounded : rounded;
    return Number(result);
  }

  public toDecimalString(decimals: number = 2): string {
    const isNegative = this.scaledAmount < 0n;
    const abs = isNegative ? -this.scaledAmount : this.scaledAmount;

    const integerPart = abs / Money.SCALE_FACTOR;
    const remainder = abs % Money.SCALE_FACTOR;

    if (decimals === 0) {
      const half = Money.SCALE_FACTOR / 2n;
      const roundedInt = (abs + half) / Money.SCALE_FACTOR;
      return `${isNegative ? '-' : ''}${roundedInt.toString()}`;
    }

    const remainderStr = remainder.toString().padStart(Money.SCALE, '0');
    const truncatedFraction = remainderStr
      .slice(0, decimals)
      .padEnd(decimals, '0');
    return `${isNegative ? '-' : ''}${integerPart.toString()}.${truncatedFraction}`;
  }

  public equals(other: Money): boolean {
    return (
      this.currency === other.currency &&
      this.scaledAmount === other.scaledAmount
    );
  }

  public isZero(): boolean {
    return this.scaledAmount === 0n;
  }

  public isNegative(): boolean {
    return this.scaledAmount < 0n;
  }

  public isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.scaledAmount > other.scaledAmount;
  }

  public isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.scaledAmount < other.scaledAmount;
  }

  public getRawScaledAmount(): bigint {
    return this.scaledAmount;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new InvalidMoneyError(
        `No se pueden operar monedas distintas: ${this.currency} y ${other.currency}`
      );
    }
  }
}
