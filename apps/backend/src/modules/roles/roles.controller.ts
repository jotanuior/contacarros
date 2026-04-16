import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { IpWhitelistGuard } from '../../common/ip-whitelist.guard';
import { Permission } from '../../common/permissions.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import type { JwtUser } from '../../common/current-user.decorator';
import { CreateRoleDto, UpdateRoleDto, UpdateRolePermissionsDto } from './dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permission('PERFIS', 'view')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('assignable')
  @Permission('USUARIOS', 'view')
  findAssignable() {
    return this.rolesService.findAssignable();
  }

  @Get('screens')
  listScreens() {
    return this.rolesService.listScreens();
  }

  @Post()
  @Permission('PERFIS', 'create')
  @UseGuards(IpWhitelistGuard)
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: JwtUser) {
    return this.rolesService.create(dto, user.sub);
  }

  @Patch(':id')
  @Permission('PERFIS', 'edit')
  @UseGuards(IpWhitelistGuard)
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: JwtUser) {
    return this.rolesService.update(id, dto, user.sub);
  }

  @Patch(':id/permissions')
  @Permission('PERFIS', 'edit')
  @UseGuards(IpWhitelistGuard)
  updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.rolesService.updatePermissions(id, dto.permissions, user.sub);
  }

  @Patch(':id/deactivate')
  @Permission('PERFIS', 'deactivate')
  @UseGuards(IpWhitelistGuard)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.rolesService.deactivate(id, user.sub);
  }
}
