import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CamerasService } from './cameras.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import type { JwtUser } from '../../common/current-user.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@Controller('cameras')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CamerasController {
  constructor(private readonly camerasService: CamerasService) {}

  @Get()
  @Roles('ADMIN', 'OPERADOR', 'AUDITOR', 'VISUALIZADOR')
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };

    return this.camerasService.findAll(pagination);
  }

  @Post()
  @Roles('ADMIN')
  create(
    @Body()
    body: {
      name: string;
      code: string;
      locationId: string;
      externalRef?: string;
      direction?: 'ENTRADA' | 'SAIDA' | 'INTERNO' | 'EXTERNO';
      active?: boolean;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.camerasService.create(body, user.sub);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      code: string;
      locationId: string;
      externalRef?: string;
      direction?: 'ENTRADA' | 'SAIDA' | 'INTERNO' | 'EXTERNO';
      active?: boolean;
    }>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.camerasService.update(id, body, user.sub);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.camerasService.remove(id, user.sub);
  }
}
