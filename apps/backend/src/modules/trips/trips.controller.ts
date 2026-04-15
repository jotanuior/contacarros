import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
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
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryType') categoryType?: string,
    @Query('subSegment') subSegment?: string,
    @Query('isGratuidade') isGratuidade?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };
    const gratuidadeFilter = isGratuidade === 'true' ? true : isGratuidade === 'false' ? false : undefined;
    return this.tripsService.list(
      {
        plate,
        status,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        categoryType: categoryType || undefined,
        subSegment: subSegment || undefined,
        isGratuidade: gratuidadeFilter,
      },
      pagination,
    );
  }

  @Get('export')
  @Roles('ADMIN', 'OPERADOR', 'AUDITOR')
  async exportTrips(
    @Query('format') format: string = 'csv',
    @Query('plate') plate?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryType') categoryType?: string,
    @Query('subSegment') subSegment?: string,
    @Res() res?: Response,
  ) {
    const filters = {
      plate: plate || undefined,
      status: status || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      categoryType: categoryType || undefined,
      subSegment: subSegment || undefined,
    };
    const normalized = (format || 'csv').toLowerCase();
    if (normalized === 'csv') {
      const content = await this.tripsService.exportTripsCsv(filters);
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res!.setHeader('Content-Disposition', 'attachment; filename="trajetos.csv"');
      res!.send(`\uFEFF${content}`);
      return;
    }
    if (normalized === 'pdf') {
      const buffer = await this.tripsService.exportTripsPdf(filters);
      res!.setHeader('Content-Type', 'application/pdf');
      res!.setHeader('Content-Disposition', 'attachment; filename="trajetos.pdf"');
      res!.send(buffer);
      return;
    }
    throw new BadRequestException('Formato inválido. Use: csv ou pdf.');
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.tripsService.findById(id);
  }
}
