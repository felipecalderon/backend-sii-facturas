import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const key = request.headers['idempotency-key'];

    if (!key) {
      return undefined;
    }

    if (Array.isArray(key)) {
      return key[0]?.trim();
    }

    return key.trim() || undefined;
  }
);
