import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';
import { RouteRulesService } from '../route-rules/route-rules.service';
import { AlertsService } from '../alerts/alerts.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeRulesService: RouteRulesService,
    private readonly alertsService: AlertsService,
    private readonly settingsService: SettingsService,
  ) {}

  async list(filters: { plate?: string; status?: string }, pagination: PaginationDto = {}) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = {
      plate: filters.plate ? { contains: filters.plate, mode: 'insensitive' as const } : undefined,
      currentStatus: filters.status as any,
    };
    const [data, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: {
          vehicle: true,
          startLocal: true,
          endLocal: true,
          tripEvents: {
            include: { location: true, camera: true },
            orderBy: { sequence: 'asc' },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.trip.count({ where }),
    ]);
    return PaginatedResponse.of(data, total, page, limit);
  }

  findById(id: string) {
    return this.prisma.trip.findUnique({
      where: { id },
      include: {
        vehicle: true,
        startLocal: true,
        endLocal: true,
        tripEvents: { include: { location: true, camera: true, reading: true }, orderBy: { sequence: 'asc' } },
        alerts: true,
      },
    });
  }

  async processReading(input: {
    plate: string;
    vehicleId?: string;
    readingId: string;
    localId: string;
    cameraId: string;
    capturedAt: Date;
  }) {
    const openTrip = await this.prisma.trip.findFirst({
      where: { plate: input.plate, currentStatus: 'EM_ANDAMENTO' },
      orderBy: { startedAt: 'desc' },
    });

    if (!openTrip) {
      const returnSameLocalCancelMinutes = await this.settingsService.getNumber('RETURN_SAME_LOCAL_CANCEL_MINUTES', 30);
      const latestClosedTrip = await this.prisma.trip.findFirst({
        where: {
          plate: input.plate,
          currentStatus: { not: 'EM_ANDAMENTO' },
          closedAt: { not: null },
        },
        include: {
          tripEvents: {
            orderBy: { sequence: 'desc' },
            take: 1,
          },
        },
        orderBy: { closedAt: 'desc' },
      });

      if (latestClosedTrip?.closedAt && latestClosedTrip.endLocalId === input.localId) {
        const lastEvent = latestClosedTrip.tripEvents[0];
        const sameCameraAsLastEvent = lastEvent ? lastEvent.cameraId === input.cameraId : true;
        const elapsedSinceCloseMinutes = Math.max(0, (input.capturedAt.getTime() - latestClosedTrip.closedAt.getTime()) / 60000);

        if (sameCameraAsLastEvent && elapsedSinceCloseMinutes <= returnSameLocalCancelMinutes) {
          return latestClosedTrip;
        }
      }

      const tripWindowMinutes = await this.settingsService.getNumber('TRIP_WINDOW_MINUTES', 30);
      const expectedUntil = new Date(input.capturedAt.getTime() + tripWindowMinutes * 60 * 1000);

      const trip = await this.prisma.trip.create({
        data: {
          plate: input.plate,
          vehicleId: input.vehicleId,
          startReadingId: input.readingId,
          startLocalId: input.localId,
          startedAt: input.capturedAt,
          currentStatus: 'EM_ANDAMENTO',
          expectedUntil,
        },
      });

      await this.prisma.tripEvent.create({
        data: {
          tripId: trip.id,
          readingId: input.readingId,
          localId: input.localId,
          cameraId: input.cameraId,
          eventAt: input.capturedAt,
          sequence: 1,
        },
      });

      return trip;
    }

    const rule = await this.routeRulesService.findRule(openTrip.startLocalId, input.localId);
    const isReturnToOrigin = input.localId === openTrip.startLocalId;
  const returnSameLocalCancelMinutes = await this.settingsService.getNumber('RETURN_SAME_LOCAL_CANCEL_MINUTES', 30);
    const elapsedMinutes = Math.max(0, (input.capturedAt.getTime() - openTrip.startedAt.getTime()) / 60000);
    const sequence = (await this.prisma.tripEvent.count({ where: { tripId: openTrip.id } })) + 1;

    await this.prisma.tripEvent.create({
      data: {
        tripId: openTrip.id,
        readingId: input.readingId,
        localId: input.localId,
        cameraId: input.cameraId,
        eventAt: input.capturedAt,
        sequence,
      },
    });

    if (rule && rule.active) {
      let resolvedResultType = rule.resultType;
      let resolvedSeverity = rule.severity;
      let resolvedDescription = rule.description || rule.resultType;

      if (isReturnToOrigin) {
        if (elapsedMinutes <= returnSameLocalCancelMinutes) {
          resolvedResultType = 'PENDENTE_VALIDACAO';
          resolvedSeverity = 'MEDIA';
          resolvedDescription = `Retorno ao mesmo ponto em ${elapsedMinutes.toFixed(1)} min (janela ${returnSameLocalCancelMinutes} min) - aguardando validação manual`;
        } else if (rule.resultType === 'CANCELADO') {
          resolvedResultType = 'CONCLUIDO_ATENCAO';
          resolvedSeverity = 'MEDIA';
          resolvedDescription = `Retorno ao mesmo ponto após ${elapsedMinutes.toFixed(1)} min (acima da janela ${returnSameLocalCancelMinutes} min)`;
        }
      }

      const updated = await this.prisma.trip.update({
        where: { id: openTrip.id },
        data: {
          endReadingId: input.readingId,
          endLocalId: input.localId,
          endedAt: input.capturedAt,
          closedAt: input.capturedAt,
          currentStatus: resolvedResultType,
          severity: resolvedSeverity,
          conclusionType: resolvedDescription,
        },
      });

      if (resolvedResultType === 'CONCLUIDO_ATENCAO') {
        await this.alertsService.create({
          type: 'ATENCAO_ROTA',
          plate: input.plate,
          tripId: updated.id,
          readingId: input.readingId,
          severity: resolvedSeverity,
          message: `Rota de atenção: ${openTrip.startLocalId} -> ${input.localId}`,
        });
      }

      if (resolvedResultType === 'PENDENTE_VALIDACAO') {
        await this.alertsService.create({
          type: 'ATENCAO_ROTA',
          plate: input.plate,
          tripId: updated.id,
          readingId: input.readingId,
          severity: resolvedSeverity,
          message: `Validação manual necessária: retorno ao mesmo ponto em ${elapsedMinutes.toFixed(1)} min`,
        });
      }

      if (resolvedResultType === 'CANCELADO') {
        await this.alertsService.create({
          type: 'CANCELADO',
          plate: input.plate,
          tripId: updated.id,
          readingId: input.readingId,
          severity: resolvedSeverity,
          message: `Trajeto cancelado: ${openTrip.startLocalId} -> ${input.localId}`,
        });
      }

      return updated;
    }

    const inconsistent = await this.prisma.trip.update({
      where: { id: openTrip.id },
      data: {
        endReadingId: input.readingId,
        endLocalId: input.localId,
        endedAt: input.capturedAt,
        closedAt: input.capturedAt,
        currentStatus: 'INCONSISTENTE',
        severity: 'ALTA',
        conclusionType: 'Sem regra cadastrada para rota',
      },
    });

    await this.alertsService.create({
      type: 'INCONSISTENTE',
      plate: input.plate,
      tripId: inconsistent.id,
      readingId: input.readingId,
      severity: 'ALTA',
      message: 'Rota sem regra cadastrada',
    });

    return inconsistent;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpiredTrips() {
    const now = new Date();
    const expiredTrips = await this.prisma.trip.findMany({
      where: {
        currentStatus: 'EM_ANDAMENTO',
        expectedUntil: { lte: now },
      },
      take: 200,
    });

    for (const trip of expiredTrips) {
      await this.prisma.trip.update({
        where: { id: trip.id },
        data: {
          currentStatus: 'SEM_SAIDA',
          severity: 'ALTA',
          closedAt: now,
          endedAt: now,
          conclusionType: 'Sem leitura de saída na janela',
        },
      });

      await this.alertsService.create({
        type: 'SEM_SAIDA',
        plate: trip.plate,
        tripId: trip.id,
        severity: 'ALTA',
        message: `Trajeto sem saída para placa ${trip.plate}`,
      });
    }
  }
}
