import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { IpWhitelistGuard } from '../../common/ip-whitelist.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles('ADMIN', 'AUDITOR')
  getAll() {
    return this.settingsService.getAll();
  }

  @Get('camera-vehicle-types')
  @Roles('ADMIN', 'AUDITOR')
  listCameraVehicleTypes() {
    return this.settingsService.listCameraVehicleTypes();
  }

  @Post()
  @Roles('ADMIN')
  @UseGuards(IpWhitelistGuard)
  set(@Body() body: { key: string; value: string; description?: string }) {
    return this.settingsService.set(body.key, body.value, body.description);
  }

  @Patch('camera-vehicle-types/:id')
  @Roles('ADMIN')
  @UseGuards(IpWhitelistGuard)
  updateCameraVehicleTypeMapping(
    @Param('id') id: string,
    @Body() body: { mappedCategory?: 'CARRO' | 'CAMINHAO' | 'ONIBUS' | null; mappedSubtype?: string | null },
  ) {
    return this.settingsService.updateCameraVehicleTypeMapping(id, body);
  }
}
