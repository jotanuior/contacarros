import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import type { Response } from 'express';
import { PaginationDto } from '../../common/pagination.dto';

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

  @Get('quantitative')
  getQuantitative(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tipo') tipo?: string,
    @Query('plate') plate?: string,
    @Query('localId') localId?: string,
    @Query('cameraId') cameraId?: string,
    @Query('isGratuidade') isGratuidade?: string,
  ) {
    const gratuidadeFilter = isGratuidade === 'true' ? true : isGratuidade === 'false' ? false : undefined;
    return this.reportsService.getQuantitative({ from, to, tipo, plate, localId, cameraId, isGratuidade: gratuidadeFilter });
  }

  @Get('descriptive')
  getDescriptive(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tipo') tipo?: string,
    @Query('plate') plate?: string,
    @Query('localId') localId?: string,
    @Query('cameraId') cameraId?: string,
    @Query('isGratuidade') isGratuidade?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };
    const gratuidadeFilter = isGratuidade === 'true' ? true : isGratuidade === 'false' ? false : undefined;
    return this.reportsService.getDescriptive({ from, to, tipo, plate, localId, cameraId, isGratuidade: gratuidadeFilter }, pagination);
  }

  @Get('export')
  async exportReport(
    @Query('mode') mode: string = 'quantitative',
    @Query('format') format: string = 'csv',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('tipo') tipo: string | undefined,
    @Query('plate') plate: string | undefined,
    @Query('localId') localId: string | undefined,
    @Query('cameraId') cameraId: string | undefined,
    @Query('isGratuidade') isGratuidade: string | undefined,
    @Res() res: Response,
  ) {
    const normalizedMode = (mode || 'quantitative').toLowerCase();
    const normalized = (format || 'csv').toLowerCase();
    const gratuidadeFilter = isGratuidade === 'true' ? true : isGratuidade === 'false' ? false : undefined;
    const filters = { from, to, tipo, plate, localId, cameraId, isGratuidade: gratuidadeFilter };

    if (!['quantitative', 'descriptive'].includes(normalizedMode)) {
      throw new BadRequestException('Modo inválido. Use: quantitative ou descriptive.');
    }

    if (normalized === 'csv') {
      const content = normalizedMode === 'quantitative'
        ? await this.reportsService.getQuantitativeCsv(filters)
        : await this.reportsService.getDescriptiveCsv(filters);
      const fileName = normalizedMode === 'quantitative' ? 'relatorio_quantitativo.csv' : 'relatorio_descritivo.csv';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(`\uFEFF${content}`);
      return;
    }

    if (normalized === 'xls' || normalized === 'xlsx') {
      const file = normalizedMode === 'quantitative'
        ? await this.reportsService.getQuantitativeXls(filters)
        : await this.reportsService.getDescriptiveXls(filters);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
      return;
    }

    if (normalized === 'pdf') {
      const file = normalizedMode === 'quantitative'
        ? await this.reportsService.getQuantitativePdf(filters)
        : await this.reportsService.getDescriptivePdf(filters);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
      return;
    }

    throw new BadRequestException('Formato inválido. Use: csv, xls ou pdf.');
  }
}
