import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException
} from '@nestjs/common';
import type { Request } from 'express';

export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const headerVal = request.headers['x-tenant-id'];
    const queryVal = request.query?.tenantId ?? request.query?.tenant_id;
    const rawVal = headerVal ?? queryVal;

    if (
      !rawVal ||
      (typeof rawVal === 'string' && rawVal.trim().length === 0) ||
      Array.isArray(rawVal)
    ) {
      throw new BadRequestException(
        'El identificador del tenant es obligatorio (vía header x-tenant-id o query param tenantId)'
      );
    }

    return (rawVal as string).trim();
  }
);
