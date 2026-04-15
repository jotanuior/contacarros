import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
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
    @Query('isGratuidade') isGratuidade?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };
    const gratuidadeFilter = isGratuidade === 'true' ? true : isGratuidade === 'false' ? false : undefined;
    return this.vehiclesService.list({ plate, categoryType, isGratuidade: gratuidadeFilter }, pagination);
  }

  @Patch('categorize/bulk')
  @Roles('ADMIN', 'OPERADOR')
  async categorizeBulk(
    @Body() body: { plates: string[]; categoryType: string; subSegment?: string },
  ) {
    const allowed = ['CARRO', 'CAMINHAO', 'ONIBUS', 'OUTRO'];
    if (!allowed.includes(body?.categoryType)) {
      throw new BadRequestException(`categoryType inválido. Use: ${allowed.join(', ')}`);
    }

    if (!Array.isArray(body?.plates) || !body.plates.length) {
      throw new BadRequestException('plates deve conter ao menos uma placa');
    }

    return this.vehiclesService.categorizeBulk(
      body.plates,
      body.categoryType as 'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO',
      body.subSegment,
    );
  }

  @Patch(':plate/categorize')
  @Roles('ADMIN', 'OPERADOR')
  async categorize(
    @Param('plate') plate: string,
    @Body() body: { categoryType: string; subSegment?: string },
  ) {
    const allowed = ['CARRO', 'CAMINHAO', 'ONIBUS', 'OUTRO'];
    if (!allowed.includes(body?.categoryType)) {
      throw new BadRequestException(`categoryType inválido. Use: ${allowed.join(', ')}`);
    }
    try {
      return await this.vehiclesService.categorize(plate, body.categoryType as 'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO', body.subSegment);
    } catch {
      throw new NotFoundException(`Veículo ${plate} não encontrado`);
    }
  }

  @Patch(':plate/correct')
  @Roles('ADMIN', 'OPERADOR')
  async correct(
    @Param('plate') plate: string,
    @Body() body: { newPlate?: string; categoryType?: string; subSegment?: string; justification: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.vehiclesService.correct(plate, user?.id, body);
  }

  @Patch(':plate/gratuidade')
  @Roles('ADMIN', 'OPERADOR')
  async setGratuidade(
    @Param('plate') plate: string,
    @Body() body: { isGratuidade: boolean; gratuidadeType?: string | null },
  ) {
    if (typeof body?.isGratuidade !== 'boolean') {
      throw new BadRequestException('isGratuidade deve ser booleano');
    }
    try {
      return await this.vehiclesService.setGratuidade(plate, body.isGratuidade, body.gratuidadeType);
    } catch {
      throw new NotFoundException(`Veículo ${plate} não encontrado`);
    }
  }
}
