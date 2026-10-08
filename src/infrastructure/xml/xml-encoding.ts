export function findNonLatin1CodePoint(value: string): number | undefined {
  const match = /[^\u0000-\u00FF]/u.exec(value);
  return match?.[0].codePointAt(0);
}

export function formatUnicodeCodePoint(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, '0');
}
