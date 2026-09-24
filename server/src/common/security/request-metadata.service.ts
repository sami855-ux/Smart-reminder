import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Environment } from '../../config/env.schema.js';

export type RequestMetadata = {
  ipHash?: string;
  userAgentHash?: string;
};

@Injectable()
export class RequestMetadataService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  fromRequest(request: Request): RequestMetadata {
    const userAgent = request.header('user-agent');
    return {
      ...(request.ip ? { ipHash: this.hash(request.ip) } : {}),
      ...(userAgent ? { userAgentHash: this.hash(userAgent) } : {}),
    };
  }

  private hash(value: string): string {
    return createHmac('sha256', this.config.get('AUTH_AUDIT_PEPPER', { infer: true }))
      .update(value)
      .digest('hex');
  }
}
