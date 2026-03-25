import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import type { JwtUser } from '../../common/current-user.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERADOR', 'AUDITOR', 'VISUALIZADOR')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  list(
    @Query('plate') plate?: string,
    @Query('isResolved') isResolved?: string,
    @Query('severity') severity?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };
    return this.alertsService.list(
      { plate, isResolved: isResolved ? isResolved === 'true' : undefined, severity, type },
      pagination,
    );
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.alertsService.resolve(id, user.sub);
  }

  @Patch(':id/decision')
  @Roles('ADMIN', 'OPERADOR', 'AUDITOR')
  decide(
    @Param('id') id: string,
    @Body() body: { decision: 'ACEITAR' | 'NEGAR'; justification: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.alertsService.decide(id, user.sub, body.decision, body.justification);
  }
}
