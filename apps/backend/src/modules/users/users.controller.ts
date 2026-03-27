import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminChangeUserPasswordDto, CreateUserDto, UpdateUserDto } from './dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { IpWhitelistGuard } from '../../common/ip-whitelist.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import type { JwtUser } from '../../common/current-user.decorator';
import { PaginationDto } from '../../common/pagination.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('ADMIN')
  @UseGuards(IpWhitelistGuard)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtUser) {
    return this.usersService.create(dto, user.sub);
  }

  @Get()
  @Roles('ADMIN', 'AUDITOR')
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination: PaginationDto = {
      page: page ? Number(page) : 1,
      limit: limit ? Math.min(Number(limit), 200) : 20,
    };

    return this.usersService.findAll(pagination);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @UseGuards(IpWhitelistGuard)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: JwtUser) {
    return this.usersService.update(id, dto, user.sub);
  }

  @Patch(':id/password')
  @Roles('ADMIN')
  @UseGuards(IpWhitelistGuard)
  changePassword(@Param('id') id: string, @Body() dto: AdminChangeUserPasswordDto, @CurrentUser() user: JwtUser) {
    return this.usersService.changePasswordByAdmin(id, dto.newPassword, user.sub);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN')
  @UseGuards(IpWhitelistGuard)
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.usersService.deactivate(id, user.sub);
  }
}