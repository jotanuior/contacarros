import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERADOR', 'AUDITOR', 'VISUALIZADOR')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  list(
    @Query('plate') plate?: string,
    @Query('categoryType') categoryType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };
    return this.vehiclesService.list({ plate, categoryType }, pagination);
  }

  @Patch(':plate/categorize')
  @Roles('ADMIN', 'OPERADOR')
  async categorize(
    @Param('plate') plate: string,
    @Body() body: { categoryType: string },
  ) {
    const allowed = ['CARRO', 'CAMINHAO', 'ONIBUS', 'OUTRO'];
    if (!allowed.includes(body?.categoryType)) {
      throw new BadRequestException(`categoryType inválido. Use: ${allowed.join(', ')}`);
    }
    try {
      return await this.vehiclesService.categorize(plate, body.categoryType as 'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO');
    } catch {
      throw new NotFoundException(`Veículo ${plate} não encontrado`);
    }
  }
}
