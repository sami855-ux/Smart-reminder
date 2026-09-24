import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Database readiness probe' })
  @ApiOkResponse({ schema: { example: { status: 'ready' } } })
  async ready(): Promise<{ status: 'ready' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('The service is not ready.');
    }
  }
}
