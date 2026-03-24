import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import axios from 'axios';
import { SettingsService } from '../settings/settings.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class PlacaFipeService {
  private readonly logger = new Logger(PlacaFipeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async fetchVehicleData(plate: string) {
    const normalizedPlate = plate.toUpperCase();

    const enabled = await this.settingsService.getBoolean('PLACA_FIPE_ENABLED', true);
    if (!enabled) {
      return null;
    }

    const cacheMinutes = await this.settingsService.getNumber('PLACA_FIPE_CACHE_MINUTES', 1440);
    const cacheLimitDate = new Date(Date.now() - cacheMinutes * 60 * 1000);

    const cachedVehicle = await this.prisma.vehicle.findUnique({ where: { plate: normalizedPlate } });
    if (cachedVehicle?.lastApiSyncAt && cachedVehicle.lastApiSyncAt > cacheLimitDate) {
      return cachedVehicle.apiRawData;
    }

    const baseUrl = (
      await this.settingsService.getValue('PLACA_FIPE_BASE_URL', process.env.PLACA_FIPE_BASE_URL || '')
    ).trim();
    const token = (
      await this.settingsService.getValue('PLACA_FIPE_TOKEN', process.env.PLACA_FIPE_TOKEN || '')
    ).trim();

    if (!baseUrl || !token) {
      this.logger.warn('Integração Placa Fipe não configurada em ambiente');
      return null;
    }

    try {
      const endpoint = `${baseUrl.replace(/\/+$/g, '')}/getplaca`;
      const response = await axios.post(
        endpoint,
        {
          placa: normalizedPlate,
          token,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 12000,
        },
      );

      await this.auditLogs.create({
        action: 'PLACA_FIPE_CONSULTA',
        entityType: 'Integration',
        description: `Consulta Placa Fipe para ${normalizedPlate}`,
        afterData: response.data,
      });

      return response.data;
    } catch (error: any) {
      await this.auditLogs.create({
        action: 'PLACA_FIPE_FALHA',
        entityType: 'Integration',
        description: `Falha na consulta Placa Fipe para ${normalizedPlate}`,
        afterData: { message: error?.message },
      });
      this.logger.error(`Falha Placa Fipe ${normalizedPlate}: ${error?.message}`);
      return null;
    }
  }

  classifyCategory(data: any): 'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO' | 'DESCONHECIDO' {
    if (!data) return 'DESCONHECIDO';
    const segment = `${data.segmento ?? ''} ${data.sub_segmento ?? ''}`.toLowerCase();

    if (segment.includes('caminh')) return 'CAMINHAO';
    if (segment.includes('ônibus') || segment.includes('onibus') || segment.includes('micro')) return 'ONIBUS';
    if (segment.includes('suv') || segment.includes('hatch') || segment.includes('sedan') || segment.includes('pickup') || segment.includes('carro')) {
      return 'CARRO';
    }

    return 'OUTRO';
  }
}
