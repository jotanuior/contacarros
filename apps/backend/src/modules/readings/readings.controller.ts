import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ReadingsService } from './readings.service';
import { LprReadingBatchDto, LprReadingDto } from './dto';
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };
    return this.readingsService.list(
      { plate, localId, cameraId, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined, lowConfidence: lowConfidence === 'true' },
      pagination,
    );
  }
}
