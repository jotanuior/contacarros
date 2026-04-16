import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { IpWhitelistGuard } from '../../common/ip-whitelist.guard';
import { Permission } from '../../common/permissions.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Permission('CONFIGURACOES', 'view')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll() {
    return this.settingsService.getAll();
  }

  @Get('camera-vehicle-types')
  listCameraVehicleTypes() {
    return this.settingsService.listCameraVehicleTypes();
  }

  @Get('gratuidade-types')
  @Permission('VEICULOS', 'view')
  async getGratuidadeTypes() {
    const raw = await this.settingsService.getValue('GRATUIDADE_TYPES', 'PCD,Carro Oficial,NGISUL');
    return { gratuidadeTypes: raw.split(',').map((s) => s.trim()).filter(Boolean) };
  }

  @Post()
  @Permission('CONFIGURACOES', 'edit')
  @UseGuards(IpWhitelistGuard)
  set(@Body() body: { key: string; value: string; description?: string }) {
    return this.settingsService.set(body.key, body.value, body.description);
  }

  @Patch('camera-vehicle-types/:id')
  @Permission('CONFIGURACOES', 'edit')
  @UseGuards(IpWhitelistGuard)
  updateCameraVehicleTypeMapping(
    @Param('id') id: string,
    @Body() body: { mappedCategory?: 'CARRO' | 'CAMINHAO' | 'ONIBUS' | null; mappedSubtype?: string | null },
  ) {
    return this.settingsService.updateCameraVehicleTypeMapping(id, body);
  }
}
