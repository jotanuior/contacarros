import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  private async buildTripWhere(start: Date, end: Date): Promise<Prisma.TripWhereInput> {
    const requireHeavyValidation = await this.settingsService.getBoolean('HEAVY_TRIPS_REQUIRE_VALIDATION', true);

    const baseWhere: Prisma.TripWhereInput = {
      startedAt: { gte: start, lte: end },
    };

    if (!requireHeavyValidation) {
      return baseWhere;
    }

    return {
      ...baseWhere,
      OR: [
        { vehicleId: null },
        { vehicle: { categoryType: { notIn: ['CAMINHAO', 'ONIBUS'] } } },
        { heavyChecks: { some: {} } },
      ],
    };
  }

  private parseDateBoundary(value: string, isEnd: boolean): Date | null {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) return null;
      if (isEnd) parsed.setUTCHours(23, 59, 59, 999);
      return parsed;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  async getDaily(params?: { date?: string; from?: string; to?: string }) {
    const from = params?.from ? this.parseDateBoundary(params.from, false) : null;
    const to = params?.to ? this.parseDateBoundary(params.to, true) : null;

    let start: Date;
    let end: Date;

    if (from || to) {
      const now = new Date();
      start = from || new Date(to || now);
      end = to || new Date(from || now);

      if (!from) start.setUTCHours(0, 0, 0, 0);
      if (!to) end.setUTCHours(23, 59, 59, 999);
    } else {
      const target = params?.date ? new Date(params.date) : new Date();
      start = new Date(target);
      start.setHours(0, 0, 0, 0);
      end = new Date(target);
      end.setHours(23, 59, 59, 999);
    }

    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }

    const tripWhere = await this.buildTripWhere(start, end);

    const [totalTrips, tripsByStatus, vehicleByCategory, tripsByLocal, lastTrips, heavyPending, openTrips, lastAlerts, tripsForHour] = await Promise.all([
      this.prisma.trip.count({ where: tripWhere }),
      this.prisma.trip.groupBy({ by: ['currentStatus'], _count: true, where: tripWhere }),
      this.prisma.trip.groupBy({ by: ['vehicleId'], _count: true, where: tripWhere }),
      this.prisma.trip.groupBy({ by: ['startLocalId'], _count: true, where: tripWhere }),
      this.prisma.trip.findMany({
        where: tripWhere,
        include: { vehicle: true, startLocal: true, endLocal: true },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
      this.prisma.reading.findMany({
        where: { vehicle: { categoryType: { in: ['CAMINHAO', 'ONIBUS'] } } },
        include: { vehicle: true, location: true },
        orderBy: { capturedAt: 'desc' },
        take: 20,
      }),
      this.prisma.trip.findMany({ where: { currentStatus: 'EM_ANDAMENTO' }, include: { startLocal: true, vehicle: true }, orderBy: { startedAt: 'desc' }, take: 20 }),
      this.prisma.alert.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.trip.findMany({ where: tripWhere, select: { startedAt: true } }),
    ]);

    const tripsByHourMap = new Map<number, number>();
    for (const trip of tripsForHour) {
      const hour = trip.startedAt.getHours();
      tripsByHourMap.set(hour, (tripsByHourMap.get(hour) || 0) + 1);
    }
    const tripsByHour = Array.from(tripsByHourMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, total]) => ({ hour, total }));

    const categoryCountMap: Record<'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO' | 'DESCONHECIDO', number> = {
      CARRO: 0,
      CAMINHAO: 0,
      ONIBUS: 0,
      OUTRO: 0,
      DESCONHECIDO: 0,
    };

    const vehicleIds = vehicleByCategory.map((x: { vehicleId: string | null }) => x.vehicleId).filter(Boolean) as string[];
    if (vehicleIds.length) {
      const vehicles = await this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, categoryType: true } });
      const vehicleMap = new Map(vehicles.map((v: { id: string; categoryType: 'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO' | 'DESCONHECIDO' }) => [v.id, v.categoryType]));
      for (const item of vehicleByCategory) {
        const category = item.vehicleId ? vehicleMap.get(item.vehicleId) : 'DESCONHECIDO';
        const key = (category || 'DESCONHECIDO') as keyof typeof categoryCountMap;
        categoryCountMap[key] += item._count;
      }
    }

    const locations = await this.prisma.location.findMany({ select: { id: true, name: true } });
    const locationMap = new Map(locations.map((l: { id: string; name: string }) => [l.id, l.name]));

    return {
      cards: {
        totalTrips,
        concludedOk: tripsByStatus.find((t: { currentStatus: string; _count: number }) => t.currentStatus === 'CONCLUIDO_OK')?._count || 0,
        concludedAttention: tripsByStatus.find((t: { currentStatus: string; _count: number }) => t.currentStatus === 'CONCLUIDO_ATENCAO')?._count || 0,
        canceled: tripsByStatus.find((t: { currentStatus: string; _count: number }) => t.currentStatus === 'CANCELADO')?._count || 0,
        noExit: tripsByStatus.find((t: { currentStatus: string; _count: number }) => t.currentStatus === 'SEM_SAIDA')?._count || 0,
        trucks: categoryCountMap.CAMINHAO,
        buses: categoryCountMap.ONIBUS,
        cars: categoryCountMap.CARRO,
      },
      charts: {
        vehicleType: Object.entries(categoryCountMap).map(([name, value]) => ({ name, value })),
        tripStatus: tripsByStatus.map((x: { currentStatus: string; _count: number }) => ({ name: x.currentStatus, value: x._count })),
        tripsByHour,
        tripsByLocal: tripsByLocal.map((x: { startLocalId: string; _count: number }) => ({
          localId: x.startLocalId,
          localName: locationMap.get(x.startLocalId) || x.startLocalId,
          value: x._count,
        })),
      },
      tables: {
        lastTrips,
        lastAlerts,
        heavyPending,
        openTrips,
      },
    };
  }
}
