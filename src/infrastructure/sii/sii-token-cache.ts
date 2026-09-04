import { SiiEnvironment } from '../../domain/sii/values/sii-domain.types.js';

interface CacheEntry {
  token: string;
  expiresAt: Date;
}

export class SiiTokenCache {
  private static readonly DEFAULT_TTL_MS = 50 * 60 * 1000; // 50 minutos
  private readonly cache = new Map<string, CacheEntry>();

  private buildKey(tenantId: string, env: SiiEnvironment): string {
    return `${tenantId.trim()}:${env}`;
  }

  public get(tenantId: string, env: SiiEnvironment): string | null {
    const key = this.buildKey(tenantId, env);
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt.getTime()) {
      this.cache.delete(key);
      return null;
    }

    return entry.token;
  }

  public set(
    tenantId: string,
    env: SiiEnvironment,
    token: string,
    ttlMs: number = SiiTokenCache.DEFAULT_TTL_MS
  ): void {
    const key = this.buildKey(tenantId, env);
    const expiresAt = new Date(Date.now() + ttlMs);
    this.cache.set(key, { token, expiresAt });
  }

  public invalidate(tenantId: string, env: SiiEnvironment): void {
    const key = this.buildKey(tenantId, env);
    this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }
}
