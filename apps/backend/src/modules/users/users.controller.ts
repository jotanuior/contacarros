import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminChangeUserPasswordDto, CreateUserDto, UpdateUserDto } from './dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { IpWhitelistGuard } from '../../common/ip-whitelist.guard';
import { Permission } from '../../common/permissions.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import type { JwtUser } from '../../common/current-user.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permission('USUARIOS', 'view')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permission('USUARIOS', 'create')
  @UseGuards(IpWhitelistGuard)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtUser) {
    return this.usersService.create(dto, user.sub);
  }

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };

    return this.usersService.findAll(pagination);
  }

  @Patch(':id')
  @Permission('USUARIOS', 'edit')
  @UseGuards(IpWhitelistGuard)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: JwtUser) {
    return this.usersService.update(id, dto, user.sub);
  }

  @Patch(':id/password')
  @Permission('USUARIOS', 'edit')
  @UseGuards(IpWhitelistGuard)
  changePassword(@Param('id') id: string, @Body() dto: AdminChangeUserPasswordDto, @CurrentUser() user: JwtUser) {
    return this.usersService.changePasswordByAdmin(id, dto.newPassword, user.sub);
  }

  @Patch(':id/deactivate')
  @Permission('USUARIOS', 'deactivate')
  @UseGuards(IpWhitelistGuard)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.usersService.deactivate(id, user.sub);
  }
}