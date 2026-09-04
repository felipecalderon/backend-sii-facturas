import {
  SiiEnvironment,
  SiiSendParams,
  SiiSendResult,
  SiiQueryStatusParams,
  SiiSendStatusResult
} from '../values/sii-domain.types.js';

export interface SiiGateway {
  getSeed(env: SiiEnvironment): Promise<string>;
  getToken(signedSeedXml: string, env: SiiEnvironment): Promise<string>;
  sendDte(params: SiiSendParams): Promise<SiiSendResult>;
  querySendStatus(params: SiiQueryStatusParams): Promise<SiiSendStatusResult>;
}
