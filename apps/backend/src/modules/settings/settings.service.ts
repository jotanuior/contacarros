import { Injectable } from '@nestjs/common';
import { VehicleCategoryType } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCameraVehicleType(value: string) {
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  async getAll() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async getValue(key: string, defaultValue: string) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ?? defaultValue;
  }

  async set(key: string, value: string, description?: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
    });
  }

  async getNumber(key: string, defaultValue: number) {
    const value = await this.getValue(key, `${defaultValue}`);
    const parsed = Number(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }

  async getBoolean(key: string, defaultValue: boolean) {
    const value = await this.getValue(key, defaultValue ? 'true' : 'false');
    return value.toLowerCase() === 'true';
  }

  async listCameraVehicleTypes() {
    return this.prisma.cameraVehicleType.findMany({
      orderBy: [{ rawType: 'asc' }],
    });
  }

  async trackCameraVehicleType(data: {
    rawType: string;
    brand?: string;
    direction?: string;
    plateColor?: string;
  }) {
    const rawType = data.rawType.trim();
    if (!rawType) {
      return null;
    }

    return this.prisma.cameraVehicleType.upsert({
      where: {
        source_normalizedRawType: {
          source: 'INTELBRAS',
          normalizedRawType: this.normalizeCameraVehicleType(rawType),
        },
      },
      update: {
        rawType,
        lastSeenAt: new Date(),
        occurrenceCount: { increment: 1 },
        sampleBrand: data.brand?.trim() || undefined,
        sampleDirection: data.direction?.trim() || undefined,
        samplePlateColor: data.plateColor?.trim() || undefined,
      },
      create: {
        source: 'INTELBRAS',
        rawType,
        normalizedRawType: this.normalizeCameraVehicleType(rawType),
        sampleBrand: data.brand?.trim() || undefined,
        sampleDirection: data.direction?.trim() || undefined,
        samplePlateColor: data.plateColor?.trim() || undefined,
      },
    });
  }

  async updateCameraVehicleTypeMapping(
    id: string,
    data: { mappedCategory?: VehicleCategoryType | null; mappedSubtype?: string | null },
  ) {
    const mappedCategory = data.mappedCategory && data.mappedCategory !== 'DESCONHECIDO' && data.mappedCategory !== 'OUTRO'
      ? data.mappedCategory
      : null;
    const mappedSubtype = mappedCategory && mappedCategory !== 'CARRO'
      ? data.mappedSubtype?.trim() || null
      : null;

    return this.prisma.cameraVehicleType.update({
      where: { id },
      data: {
        mappedCategory,
        mappedSubtype,
      },
    });
  }
}
