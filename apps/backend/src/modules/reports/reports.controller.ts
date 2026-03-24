import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'AUDITOR')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  getData(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getData(from, to);
  }

  @Get('csv')
  getCsv(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getCsv(from, to);
  }
}
