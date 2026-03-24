import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
