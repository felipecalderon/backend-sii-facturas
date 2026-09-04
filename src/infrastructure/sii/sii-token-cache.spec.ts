import { describe, it, expect, vi } from 'vitest';
import { SiiTokenCache } from './sii-token-cache.js';

describe('SiiTokenCache', () => {
  it('debe almacenar y recuperar un token válido para un tenant y ambiente', () => {
    const cache = new SiiTokenCache();

    cache.set('tenant-1', 'CERTIFICATION', 'TOKEN-CERT-123');
    cache.set('tenant-1', 'PRODUCTION', 'TOKEN-PROD-456');
    cache.set('tenant-2', 'CERTIFICATION', 'TOKEN-TENANT2-789');

    expect(cache.get('tenant-1', 'CERTIFICATION')).toBe('TOKEN-CERT-123');
    expect(cache.get('tenant-1', 'PRODUCTION')).toBe('TOKEN-PROD-456');
    expect(cache.get('tenant-2', 'CERTIFICATION')).toBe('TOKEN-TENANT2-789');
    expect(cache.get('tenant-2', 'PRODUCTION')).toBeNull();
  });

  it('debe expirar tokens cuando el TTL transcurre', () => {
    const cache = new SiiTokenCache();

    // Guardar con TTL de 100ms
    cache.set('tenant-exp', 'CERTIFICATION', 'TOKEN-SHORT', 100);
    expect(cache.get('tenant-exp', 'CERTIFICATION')).toBe('TOKEN-SHORT');

    // Avanzar reloj 150ms
    vi.setSystemTime(Date.now() + 150);
    expect(cache.get('tenant-exp', 'CERTIFICATION')).toBeNull();

    vi.useRealTimers();
  });

  it('debe permitir invalidar un token específico o limpiar toda la caché', () => {
    const cache = new SiiTokenCache();
    cache.set('tenant-1', 'CERTIFICATION', 'TOKEN-A');
    cache.set('tenant-2', 'CERTIFICATION', 'TOKEN-B');

    cache.invalidate('tenant-1', 'CERTIFICATION');
    expect(cache.get('tenant-1', 'CERTIFICATION')).toBeNull();
    expect(cache.get('tenant-2', 'CERTIFICATION')).toBe('TOKEN-B');

    cache.clear();
    expect(cache.get('tenant-2', 'CERTIFICATION')).toBeNull();
  });
});
