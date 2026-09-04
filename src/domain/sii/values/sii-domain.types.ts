import { Rut } from '../../shared/rut.vo.js';

export type SiiEnvironment = 'CERTIFICATION' | 'PRODUCTION';

export interface SiiSessionToken {
  token: string;
  expiresAt: Date;
}

export interface SiiSendParams {
  env: SiiEnvironment;
  token: string;
  rutSender: Rut;
  rutCompany: Rut;
  envioDteXml: string;
}

export interface SiiSendResult {
  trackId: string;
  status: string;
  rawResponse?: string;
}

export interface SiiQueryStatusParams {
  env: SiiEnvironment;
  token: string;
  rutCompany: Rut;
  trackId: string;
}

export type SiiSendStatusEnum = 'EPR' | 'REC' | 'RECH' | 'UNKNOWN';

export interface SiiSendStatusResult {
  status: SiiSendStatusEnum;
  glosa?: string;
  detalle?: string[];
  rawResponse?: string;
}
