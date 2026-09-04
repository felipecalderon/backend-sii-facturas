import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException
} from '@nestjs/common';
import type { Request } from 'express';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const tenantId = request.headers['x-tenant-id'];

    if (
      !tenantId ||
      (typeof tenantId === 'string' && tenantId.trim().length === 0) ||
      Array.isArray(tenantId)
    ) {
      throw new BadRequestException('El header x-tenant-id es obligatorio');
    }

    return tenantId.trim();
  }
);
