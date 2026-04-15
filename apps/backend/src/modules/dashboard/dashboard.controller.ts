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
  daily(
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('plate') plate?: string,
    @Query('status') status?: string,
    @Query('categoryType') categoryType?: string,
    @Query('subSegment') subSegment?: string,
    @Query('isGratuidade') isGratuidade?: string,
    @Query('startLocalId') startLocalId?: string,
  ) {
    const gratuidadeFilter = isGratuidade === 'true' ? true : isGratuidade === 'false' ? false : undefined;
    return this.dashboardService.getDaily({
      date,
      from,
      to,
      plate,
      status,
      categoryType,
      subSegment,
      isGratuidade: gratuidadeFilter,
      startLocalId,
    });
  }
}
