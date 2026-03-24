import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import type { Response } from 'express';

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
  getQuantitative(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getQuantitative(from, to);
  }

  @Get('quantitative/export')
  async exportQuantitative(
    @Query('format') format: string = 'csv',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const normalized = (format || 'csv').toLowerCase();

    if (normalized === 'csv') {
      const content = await this.reportsService.getQuantitativeCsv(from, to);
      const fileName = `quantitativo_tipo_subtipo.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(`\uFEFF${content}`);
      return;
    }

    if (normalized === 'xls' || normalized === 'xlsx') {
      const file = await this.reportsService.getQuantitativeXls(from, to);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
      return;
    }

    if (normalized === 'pdf') {
      const file = await this.reportsService.getQuantitativePdf(from, to);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
      return;
    }

    throw new BadRequestException('Formato inválido. Use: csv, xls ou pdf.');
  }
}
