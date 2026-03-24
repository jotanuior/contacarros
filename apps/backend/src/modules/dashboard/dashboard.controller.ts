import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERADOR', 'AUDITOR', 'VISUALIZADOR')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('daily')
  daily(@Query('date') date?: string) {
    return this.dashboardService.getDaily(date);
  }
}
