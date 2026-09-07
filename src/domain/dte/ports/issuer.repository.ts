import { Issuer } from '../entities/issuer.entity.js';

export interface IssuerRepository {
  save(tenantId: string, issuer: Issuer): Promise<void>;
  findByTenantId(tenantId: string): Promise<Issuer | null>;
}

export const ISSUER_REPOSITORY_TOKEN = 'ISSUER_REPOSITORY';
