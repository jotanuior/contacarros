import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERADOR', 'AUDITOR', 'VISUALIZADOR')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  list(
    @Query('plate') plate?: string,
    @Query('status') status?: string,
    @Query('isGratuidade') isGratuidade?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };
    const gratuidadeFilter = isGratuidade === 'true' ? true : isGratuidade === 'false' ? false : undefined;
    return this.tripsService.list({ plate, status, isGratuidade: gratuidadeFilter }, pagination);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.tripsService.findById(id);
  }
}
