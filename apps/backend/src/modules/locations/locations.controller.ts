import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Permission } from '../../common/permissions.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import type { JwtUser } from '../../common/current-user.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permission('LOCAIS', 'view')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };

    return this.locationsService.findAll(pagination);
  }

  @Post()
  @Permission('LOCAIS', 'create')
  create(@Body() body: { name: string; code: string; description?: string; active?: boolean }, @CurrentUser() user: JwtUser) {
    return this.locationsService.create(body, user.sub);
  }

  @Patch(':id')
  @Permission('LOCAIS', 'edit')
  update(@Param('id') id: string, @Body() body: { name?: string; code?: string; description?: string; active?: boolean }, @CurrentUser() user: JwtUser) {
    return this.locationsService.update(id, body, user.sub);
  }

  @Delete(':id')
  @Permission('LOCAIS', 'deactivate')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.locationsService.remove(id, user.sub);
  }
}