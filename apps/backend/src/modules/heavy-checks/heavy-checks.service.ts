import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class HeavyChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  private readonly defaultTruckSubtypes = [
    'Caminhão pequeno',
    'Caminhão 3/4',
    'Caminhão toco',
    'Caminhão truck',
    'Carreta',
    'Bitrem',
    'Rodotrem',
    'Caminhão grande',
  ];

  private readonly defaultBusSubtypes = [
    'Micro-ônibus',
    'Ônibus urbano',
    'Ônibus rodoviário',
    'Ônibus fretado',
  ];

  private parseSubtypes(rawValue: string): string[] {
    const unique = new Set(
      rawValue
        .split(/[;,\n\r]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    );

    return Array.from(unique);
  }

  async subtypes() {
    const truckRaw = await this.settingsService.getValue('TRUCK_SUBTYPES', this.defaultTruckSubtypes.join(','));
    const busRaw = await this.settingsService.getValue('BUS_SUBTYPES', this.defaultBusSubtypes.join(','));

    const truckSubtypes = this.parseSubtypes(truckRaw);
    const busSubtypes = this.parseSubtypes(busRaw);

    return {
      truckSubtypes: truckSubtypes.length ? truckSubtypes : this.defaultTruckSubtypes,
      busSubtypes: busSubtypes.length ? busSubtypes : this.defaultBusSubtypes,
    };
  }

  pending() {
    return this.prisma.reading.findMany({
      where: {
        vehicle: {
          categoryType: { in: ['CAMINHAO', 'ONIBUS'] },
        },
        heavyChecks: {
          none: {},
        },
      },
      include: {
        vehicle: true,
        location: true,
        camera: true,
        tripEvents: { include: { trip: true } },
      },
      orderBy: { capturedAt: 'desc' },
      take: 100,
    });
  }

  async check(data: {
    tripId?: string;
    readingId?: string;
    vehicleId: string;
    checkedByUserId: string;
    subtype: string;
    notes?: string;
  }) {
    return this.prisma.heavyVehicleCheck.create({
      data: {
        ...data,
        checkedAt: new Date(),
      },
    });
  }

  history() {
    return this.prisma.heavyVehicleCheck.findMany({
      include: { vehicle: true, checkedByUser: true, trip: true, reading: true },
      orderBy: { checkedAt: 'desc' },
      take: 300,
    });
  }
}
