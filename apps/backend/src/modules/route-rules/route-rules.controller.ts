import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RouteRulesService } from './route-rules.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Permission } from '../../common/permissions.decorator';

@Controller('route-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permission('REGRAS_ROTA', 'view')
export class RouteRulesController {
  constructor(private readonly routeRulesService: RouteRulesService) {}

  @Get()
  list() {
    return this.routeRulesService.list();
  }

  @Post()
  @Permission('REGRAS_ROTA', 'create')
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
  @Permission('REGRAS_ROTA', 'edit')
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
  @Permission('REGRAS_ROTA', 'deactivate')
  remove(@Param('id') id: string) {
    return this.routeRulesService.remove(id);
  }
}
