import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health Check')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Status API Health Check' })
  getHealth() {
    return {
      name: 'NextERP & Inventory Core API',
      status: 'online',
      version: '1.0.0',
      documentation: '/api/docs',
      timestamp: new Date().toISOString(),
    };
  }
}
