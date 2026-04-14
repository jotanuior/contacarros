import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ReadingsService } from './readings.service';
import { ImportIntelbrasCsvDto, LprReadingBatchDto, LprReadingDto } from './dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@Controller('lpr/readings')
export class ReadingsController {
  constructor(private readonly readingsService: ReadingsService) {}

  @Post()
  create(@Body() dto: LprReadingDto) {
    return this.readingsService.ingest(dto);
  }

  @Post('batch')
  createBatch(@Body() dto: LprReadingBatchDto) {
    return this.readingsService.ingestBatch(dto.readings || []);
  }

  @Post('import/intelbras-csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OPERADOR')
  @UseInterceptors(FileInterceptor('file'))
  importIntelbrasCsv(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Body() body: ImportIntelbrasCsvDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo CSV não enviado. Use multipart/form-data com campo file.');
    }

    return this.readingsService.importIntelbrasCsv({
      csvText: file.buffer.toString('utf8'),
      cameraCode: body.cameraCode,
      delimiter: body.delimiter,
      defaultConfidence: body.defaultConfidence,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OPERADOR', 'AUDITOR', 'VISUALIZADOR')
  list(
    @Query('plate') plate?: string,
    @Query('localId') localId?: string,
    @Query('cameraId') cameraId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('lowConfidence') lowConfidence?: string,
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
    return this.readingsService.list(
      {
        plate,
        localId,
        cameraId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        lowConfidence: lowConfidence === 'true',
        categoryType: categoryType || undefined,
        subSegment: subSegment || undefined,
        isGratuidade: gratuidadeFilter,
      },
      pagination,
    );
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'OPERADOR', 'AUDITOR')
  async exportReadings(
    @Query('format') format: string = 'csv',
    @Query('plate') plate?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('categoryType') categoryType?: string,
    @Query('subSegment') subSegment?: string,
    @Res() res?: Response,
  ) {
    const filters = {
      plate: plate || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      categoryType: categoryType || undefined,
      subSegment: subSegment || undefined,
    };

    const normalized = (format || 'csv').toLowerCase();

    if (normalized === 'csv') {
      const content = await this.readingsService.exportReadingsCsv(filters);
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res!.setHeader('Content-Disposition', 'attachment; filename="leituras.csv"');
      res!.send(`\uFEFF${content}`);
      return;
    }

    if (normalized === 'pdf') {
      const buffer = await this.readingsService.exportReadingsPdf(filters);
      res!.setHeader('Content-Type', 'application/pdf');
      res!.setHeader('Content-Disposition', 'attachment; filename="leituras.pdf"');
      res!.send(buffer);
      return;
    }

    throw new BadRequestException('Formato inválido. Use: csv ou pdf.');
  }
}
