import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

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

    const [totalReadings, totalTrips, tripsByStatus, vehicleByCategory, readingsByHour, readingsByLocal, lastReadings, heavyPending, openTrips, lastAlerts] = await Promise.all([
      this.prisma.reading.count({ where: { capturedAt: { gte: start, lte: end } } }),
      this.prisma.trip.count({ where: { startedAt: { gte: start, lte: end } } }),
      this.prisma.trip.groupBy({ by: ['currentStatus'], _count: true, where: { startedAt: { gte: start, lte: end } } }),
      this.prisma.reading.groupBy({ by: ['vehicleId'], _count: true, where: { capturedAt: { gte: start, lte: end } } }),
      this.prisma.$queryRaw<Array<{ hour: number; total: number }>>`
        SELECT EXTRACT(HOUR FROM "capturedAt")::int as hour, COUNT(*)::int as total
        FROM "Reading"
        WHERE "capturedAt" BETWEEN ${start} AND ${end}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.reading.groupBy({ by: ['localId'], _count: true, where: { capturedAt: { gte: start, lte: end } } }),
      this.prisma.reading.findMany({ where: { capturedAt: { gte: start, lte: end } }, include: { vehicle: true, location: true, camera: true }, orderBy: { capturedAt: 'desc' }, take: 20 }),
      this.prisma.reading.findMany({
        where: { vehicle: { categoryType: { in: ['CAMINHAO', 'ONIBUS'] } } },
        include: { vehicle: true, location: true },
        orderBy: { capturedAt: 'desc' },
        take: 20,
      }),
      this.prisma.trip.findMany({ where: { currentStatus: 'EM_ANDAMENTO' }, include: { startLocal: true, vehicle: true }, orderBy: { startedAt: 'desc' }, take: 20 }),
      this.prisma.alert.findMany({ where: { createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

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
        totalReadings,
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
        readingsByHour,
        readingsByLocal: readingsByLocal.map((x: { localId: string; _count: number }) => ({
          localId: x.localId,
          localName: locationMap.get(x.localId) || x.localId,
          value: x._count,
        })),
      },
      tables: {
        lastReadings,
        lastAlerts,
        heavyPending,
        openTrips,
      },
    };
  }
}
