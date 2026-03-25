import { Injectable } from '@nestjs/common';
import { Prisma, VehicleCategoryType } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private buildTripWhere(start: Date, end: Date): Prisma.TripWhereInput {
    return {
      startedAt: { gte: start, lte: end },
    };
  }

  private getTripCategory(trip: {
    vehicle: { categoryType: VehicleCategoryType } | null;
    tripEvents: Array<{ reading: { vehicle: { categoryType: VehicleCategoryType } | null } | null }>;
  }): VehicleCategoryType | 'DESCONHECIDO' {
    if (trip.vehicle?.categoryType) {
      return trip.vehicle.categoryType;
    }

    const eventCategory = trip.tripEvents
      .map((event) => event.reading?.vehicle?.categoryType)
      .find(Boolean);

    return eventCategory || 'DESCONHECIDO';
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

    const tripWhere = this.buildTripWhere(start, end);

    const [candidateTrips, heavyPending, openTrips, lastAlerts, latestTrip] = await Promise.all([
      this.prisma.trip.findMany({
        where: tripWhere,
        include: {
          vehicle: true,
          startLocal: true,
          endLocal: true,
          tripEvents: {
            include: {
              reading: {
                select: {
                  id: true,
                  vehicle: { select: { categoryType: true } },
                },
              },
            },
          },
        },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.reading.findMany({
        where: { vehicle: { categoryType: { in: ['CAMINHAO', 'ONIBUS'] } } },
        include: { vehicle: true, location: true },
        orderBy: { capturedAt: 'desc' },
        take: 20,
      }),
      this.prisma.trip.findMany({ where: { currentStatus: 'EM_ANDAMENTO' }, include: { startLocal: true, vehicle: true }, orderBy: { startedAt: 'desc' }, take: 20 }),
      this.prisma.alert.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.trip.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }),
    ]);

    const filteredTrips = candidateTrips;

    const totalTrips = filteredTrips.length;

    const tripsByStatusMap = new Map<string, number>();
    const tripsByHourMap = new Map<number, number>();
    const tripsByLocalMap = new Map<string, number>();

    const categoryCountMap: Record<'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO' | 'DESCONHECIDO', number> = {
      CARRO: 0,
      CAMINHAO: 0,
      ONIBUS: 0,
      OUTRO: 0,
      DESCONHECIDO: 0,
    };

    for (const trip of filteredTrips) {
      tripsByStatusMap.set(trip.currentStatus, (tripsByStatusMap.get(trip.currentStatus) || 0) + 1);

      const hour = trip.startedAt.getHours();
      tripsByHourMap.set(hour, (tripsByHourMap.get(hour) || 0) + 1);

      tripsByLocalMap.set(trip.startLocalId, (tripsByLocalMap.get(trip.startLocalId) || 0) + 1);

      const category = this.getTripCategory(trip);
      categoryCountMap[category as keyof typeof categoryCountMap] += 1;
    }

    const tripsByStatus = Array.from(tripsByStatusMap.entries()).map(([currentStatus, count]) => ({
      currentStatus,
      _count: count,
    }));

    const tripsByHour = Array.from(tripsByHourMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, total]) => ({ hour, total }));

    const locationIds = Array.from(tripsByLocalMap.keys());
    const locations = await this.prisma.location.findMany({
      where: locationIds.length ? { id: { in: locationIds } } : undefined,
      select: { id: true, name: true },
    });
    const locationMap = new Map(locations.map((l: { id: string; name: string }) => [l.id, l.name]));

    const tripsByLocal = Array.from(tripsByLocalMap.entries()).map(([startLocalId, count]) => ({
      startLocalId,
      _count: count,
    }));

    const lastTrips = filteredTrips.slice(0, 20).map((trip) => ({
      ...trip,
      tripEvents: undefined,
    }));

    return {
      meta: {
        lastTripDate: latestTrip?.startedAt ? latestTrip.startedAt.toISOString().slice(0, 10) : null,
      },
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
