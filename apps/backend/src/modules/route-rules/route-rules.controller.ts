import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RouteRulesService } from './route-rules.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('route-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RouteRulesController {
  constructor(private readonly routeRulesService: RouteRulesService) {}

  @Get()
  @Roles('ADMIN', 'OPERADOR', 'AUDITOR', 'VISUALIZADOR')
  list() {
    return this.routeRulesService.list();
  }

  @Post()
  @Roles('ADMIN')
  create(
    @Body()
    body: {
      originLocalId: string;
      destinationLocalId: string;
      resultType: 'CONCLUIDO_OK' | 'CONCLUIDO_ATENCAO' | 'CANCELADO' | 'INCONSISTENTE' | 'PENDENTE_VALIDACAO';
      severity: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
      active?: boolean;
      description?: string;
    },
  ) {
    return this.routeRulesService.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      originLocalId: string;
      destinationLocalId: string;
      resultType: 'CONCLUIDO_OK' | 'CONCLUIDO_ATENCAO' | 'CANCELADO' | 'INCONSISTENTE' | 'PENDENTE_VALIDACAO';
      severity: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
      active?: boolean;
      description?: string;
    }>,
  ) {
    return this.routeRulesService.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.routeRulesService.remove(id);
  }
}
