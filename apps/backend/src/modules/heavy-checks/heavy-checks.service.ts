import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class HeavyChecksService {
  constructor(private readonly prisma: PrismaService) {}

  pending() {
    return this.prisma.reading.findMany({
      where: {
        vehicle: {
          categoryType: { in: ['CAMINHAO', 'ONIBUS'] },
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
