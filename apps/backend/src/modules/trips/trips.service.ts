import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';
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

  async list(
    filters: { plate?: string; status?: string; from?: Date; to?: Date; categoryType?: string; subSegment?: string; isGratuidade?: boolean },
    pagination: PaginationDto = {},
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const vehicleFilter: Record<string, any> = {};
    if (filters.isGratuidade !== undefined) vehicleFilter.isGratuidade = filters.isGratuidade;
    if (filters.categoryType) vehicleFilter.categoryType = filters.categoryType;
    if (filters.subSegment) vehicleFilter.subSegment = { contains: filters.subSegment, mode: 'insensitive' as const };
    const where = {
      plate: filters.plate ? { contains: filters.plate, mode: 'insensitive' as const } : undefined,
      currentStatus: filters.status as any,
      startedAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
      vehicle: Object.keys(vehicleFilter).length > 0 ? vehicleFilter : undefined,
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

  async exportTripsCsv(filters: { plate?: string; status?: string; from?: Date; to?: Date; categoryType?: string; subSegment?: string; isGratuidade?: boolean }) {
    const to = filters.to ?? new Date();
    const from = filters.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const vehicleFilter: Record<string, any> = {};
    if (filters.categoryType) vehicleFilter.categoryType = filters.categoryType;
    if (filters.subSegment) vehicleFilter.subSegment = { contains: filters.subSegment, mode: 'insensitive' as const };
    if (filters.isGratuidade !== undefined) vehicleFilter.isGratuidade = filters.isGratuidade;
    const where = {
      plate: filters.plate ? { contains: filters.plate, mode: 'insensitive' as const } : undefined,
      currentStatus: filters.status as any,
      startedAt: { gte: from, lte: to },
      vehicle: Object.keys(vehicleFilter).length > 0 ? vehicleFilter : undefined,
    };
    const trips = await this.prisma.trip.findMany({
      where,
      select: {
        plate: true,
        currentStatus: true,
        severity: true,
        startedAt: true,
        endedAt: true,
        vehicle: { select: { categoryType: true, subSegment: true } },
        startLocal: { select: { name: true } },
        endLocal: { select: { name: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 5000,
    });
    const parser = new Parser({
      fields: ['startedAt', 'plate', 'tipo', 'subtipo', 'origem', 'destino', 'status', 'severidade', 'endedAt'],
    });
    const rows = trips.map((t) => ({
      startedAt: t.startedAt?.toISOString() ?? '-',
      plate: t.plate,
      tipo: t.vehicle?.categoryType ?? '-',
      subtipo: t.vehicle?.subSegment ?? '-',
      origem: t.startLocal?.name ?? '-',
      destino: t.endLocal?.name ?? '-',
      status: t.currentStatus,
      severidade: t.severity ?? '-',
      endedAt: t.endedAt?.toISOString() ?? '-',
    }));
    return parser.parse(rows);
  }

  async exportTripsPdf(filters: { plate?: string; status?: string; from?: Date; to?: Date; categoryType?: string; subSegment?: string; isGratuidade?: boolean }) {
    const to = filters.to ?? new Date();
    const from = filters.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const vehicleFilter: Record<string, any> = {};
    if (filters.categoryType) vehicleFilter.categoryType = filters.categoryType;
    if (filters.subSegment) vehicleFilter.subSegment = { contains: filters.subSegment, mode: 'insensitive' as const };
    if (filters.isGratuidade !== undefined) vehicleFilter.isGratuidade = filters.isGratuidade;
    const where = {
      plate: filters.plate ? { contains: filters.plate, mode: 'insensitive' as const } : undefined,
      currentStatus: filters.status as any,
      startedAt: { gte: from, lte: to },
      vehicle: Object.keys(vehicleFilter).length > 0 ? vehicleFilter : undefined,
    };
    const trips = await this.prisma.trip.findMany({
      where,
      select: {
        plate: true,
        currentStatus: true,
        severity: true,
        startedAt: true,
        endedAt: true,
        vehicle: { select: { categoryType: true, subSegment: true } },
        startLocal: { select: { name: true } },
        endLocal: { select: { name: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 2000,
    });
    const fmt = (d: Date | null) =>
      d ? d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer | Uint8Array) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(13).text('Relatório de Trajetos');
      doc.fontSize(9).text(`Período: ${fmt(from)} até ${fmt(to)}`);
      if (filters.plate) doc.text(`Placa: ${filters.plate}`);
      if (filters.status) doc.text(`Status: ${filters.status}`);
      doc.text(`Total: ${trips.length}`);
      doc.moveDown(0.5);
      const cols = { inicio: 30, plate: 120, tipo: 195, origem: 265, destino: 380, status: 495, sev: 580, fim: 625 };
      let y = doc.y;
      const drawHeader = () => {
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Início', cols.inicio, y, { width: 85 });
        doc.text('Placa', cols.plate, y, { width: 70 });
        doc.text('Tipo', cols.tipo, y, { width: 65 });
        doc.text('Origem', cols.origem, y, { width: 110 });
        doc.text('Destino', cols.destino, y, { width: 110 });
        doc.text('Status', cols.status, y, { width: 80 });
        doc.text('Sev.', cols.sev, y, { width: 40 });
        doc.text('Fim', cols.fim, y, { width: 85 });
        y += 14;
        doc.moveTo(cols.inicio, y - 2).lineTo(750, y - 2).stroke('#94a3b8');
        doc.font('Helvetica');
      };
      drawHeader();
      for (const t of trips) {
        if (y > 530) { doc.addPage(); y = 30; drawHeader(); }
        doc.fontSize(7);
        doc.text(fmt(t.startedAt), cols.inicio, y, { width: 85 });
        doc.text(t.plate, cols.plate, y, { width: 70 });
        doc.text(t.vehicle?.categoryType ?? '-', cols.tipo, y, { width: 65 });
        doc.text(t.startLocal?.name ?? '-', cols.origem, y, { width: 110 });
        doc.text(t.endLocal?.name ?? '-', cols.destino, y, { width: 110 });
        doc.text(t.currentStatus, cols.status, y, { width: 80 });
        doc.text(t.severity ?? '-', cols.sev, y, { width: 40 });
        doc.text(fmt(t.endedAt), cols.fim, y, { width: 85 });
        y += 12;
      }
      doc.end();
    });
    return buffer;
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
      include: { startLocal: true },
    });

    if (!openTrip) {
      const returnSameLocalCancelMinutes = await this.settingsService.getNumber('RETURN_SAME_LOCAL_CANCEL_MINUTES', 30);
      const tripWindowMinutes = await this.settingsService.getNumber('TRIP_WINDOW_MINUTES', 30);
      const enforceRouteRules = await this.settingsService.getBoolean('TRIPS_ENFORCE_ROUTE_RULES', true);
      const latestClosedTrip = await this.prisma.trip.findFirst({
        where: {
          plate: input.plate,
          currentStatus: { not: 'EM_ANDAMENTO' },
          closedAt: { not: null },
        },
        include: {
          startLocal: true,
          tripEvents: {
            orderBy: { sequence: 'desc' },
            take: 1,
          },
        },
        orderBy: { closedAt: 'desc' },
      });

      if (latestClosedTrip?.closedAt) {
        // Dedup: same-location return (any status)
        if (latestClosedTrip.endLocalId === input.localId) {
          const lastEvent = latestClosedTrip.tripEvents[0];
          const sameCameraAsLastEvent = lastEvent ? lastEvent.cameraId === input.cameraId : true;
          const elapsedSinceCloseMinutes = Math.max(0, (input.capturedAt.getTime() - latestClosedTrip.closedAt.getTime()) / 60000);

          if (sameCameraAsLastEvent && elapsedSinceCloseMinutes <= returnSameLocalCancelMinutes) {
            return latestClosedTrip;
          }
        }

        // Dedup for SEM_SAIDA: vehicle re-seen at the same origin (endLocalId is null for SEM_SAIDA)
        if (
          latestClosedTrip.currentStatus === 'SEM_SAIDA' &&
          latestClosedTrip.startLocalId === input.localId
        ) {
          const lastEvent = latestClosedTrip.tripEvents[0];
          const sameCameraAsLastEvent = lastEvent ? lastEvent.cameraId === input.cameraId : true;
          const elapsedSinceCloseMinutes = Math.max(0, (input.capturedAt.getTime() - latestClosedTrip.closedAt.getTime()) / 60000);

          if (sameCameraAsLastEvent && elapsedSinceCloseMinutes <= returnSameLocalCancelMinutes) {
            return latestClosedTrip;
          }
        }

        // Rescue: latest trip was closed as SEM_SAIDA by the cron (race condition), but this
        // reading proves the vehicle DID exit — it arrived at a different location and its
        // capturedAt is still within the original trip window.
        if (
          latestClosedTrip.currentStatus === 'SEM_SAIDA' &&
          input.localId !== latestClosedTrip.startLocalId &&
          input.capturedAt.getTime() <= latestClosedTrip.startedAt.getTime() + tripWindowMinutes * 60 * 1000
        ) {
          const sequence = (await this.prisma.tripEvent.count({ where: { tripId: latestClosedTrip.id } })) + 1;
          await this.prisma.tripEvent.create({
            data: {
              tripId: latestClosedTrip.id,
              readingId: input.readingId,
              localId: input.localId,
              cameraId: input.cameraId,
              eventAt: input.capturedAt,
              sequence,
            },
          });

          const enforceRouteRules = await this.settingsService.getBoolean('TRIPS_ENFORCE_ROUTE_RULES', true);
          const rescueRule = enforceRouteRules
            ? await this.routeRulesService.findRule(latestClosedTrip.startLocalId, input.localId)
            : null;
          let rescueStatus: import('@prisma/client').TripStatus = 'INCONSISTENTE';
          let rescueSeverity: 'BAIXA' | 'MEDIA' | 'ALTA' = 'ALTA';
          let rescueConclusion = 'Sem regra cadastrada para rota';

          if (!enforceRouteRules) {
            rescueStatus = 'CONCLUIDO_OK';
            rescueSeverity = 'BAIXA';
            rescueConclusion = 'Fechado sem validação de regra de rota (configuração)';
          } else if (rescueRule?.active) {
            rescueStatus = rescueRule.resultType;
            rescueSeverity = rescueRule.severity as 'BAIXA' | 'MEDIA' | 'ALTA';
            rescueConclusion = rescueRule.description ?? rescueRule.resultType;
          }

          const rescued = await this.prisma.trip.update({
            where: { id: latestClosedTrip.id },
            data: {
              endReadingId: input.readingId,
              endLocalId: input.localId,
              endedAt: input.capturedAt,
              closedAt: input.capturedAt,
              currentStatus: rescueStatus,
              severity: rescueSeverity,
              conclusionType: rescueConclusion,
            },
          });

          // Remove the incorrect SEM_SAIDA alert generated by the cron
          await this.prisma.alert.deleteMany({
            where: { tripId: latestClosedTrip.id, type: 'SEM_SAIDA' },
          });

          if (rescueStatus === 'INCONSISTENTE') {
            const endLocal = await this.prisma.location.findUnique({ where: { id: input.localId }, select: { name: true } });
            await this.alertsService.create({
              type: 'INCONSISTENTE',
              plate: input.plate,
              tripId: rescued.id,
              readingId: input.readingId,
              severity: rescueSeverity,
              message: `Veículo saiu do ${latestClosedTrip.startLocal?.name ?? latestClosedTrip.startLocalId} e foi para o ${endLocal?.name ?? input.localId}. Rota sem regra cadastrada.`,
            });
          } else if (rescueStatus === 'CONCLUIDO_ATENCAO' || rescueRule?.resultType === 'CANCELADO') {
            const endLocal = await this.prisma.location.findUnique({ where: { id: input.localId }, select: { name: true } });
            await this.alertsService.create({
              type: rescueStatus === 'CANCELADO' ? 'CANCELADO' : 'ATENCAO_ROTA',
              plate: input.plate,
              tripId: rescued.id,
              readingId: input.readingId,
              severity: rescueSeverity,
              message: `Rota ${rescueStatus === 'CANCELADO' ? 'cancelada' : 'de atenção'}: ${latestClosedTrip.startLocal?.name ?? latestClosedTrip.startLocalId} -> ${endLocal?.name ?? input.localId}`,
            });
          }

          return rescued;
        }
      }

      if (!enforceRouteRules) {
        const singlePointTrip = await this.prisma.trip.create({
          data: {
            plate: input.plate,
            vehicleId: input.vehicleId,
            startReadingId: input.readingId,
            endReadingId: input.readingId,
            startLocalId: input.localId,
            endLocalId: input.localId,
            startedAt: input.capturedAt,
            endedAt: input.capturedAt,
            closedAt: input.capturedAt,
            currentStatus: 'CONCLUIDO_OK',
            severity: 'BAIXA',
            conclusionType: 'Fechado em ponto unico (sem validacao por rota)',
          },
        });

        await this.prisma.tripEvent.create({
          data: {
            tripId: singlePointTrip.id,
            readingId: input.readingId,
            localId: input.localId,
            cameraId: input.cameraId,
            eventAt: input.capturedAt,
            sequence: 1,
          },
        });

        return singlePointTrip;
      }

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

    const enforceRouteRules = await this.settingsService.getBoolean('TRIPS_ENFORCE_ROUTE_RULES', true);
    const rule = enforceRouteRules
      ? await this.routeRulesService.findRule(openTrip.startLocalId, input.localId)
      : null;
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

    if (!enforceRouteRules) {
      const updated = await this.prisma.trip.update({
        where: { id: openTrip.id },
        data: {
          endReadingId: input.readingId,
          endLocalId: input.localId,
          endedAt: input.capturedAt,
          closedAt: input.capturedAt,
          currentStatus: 'CONCLUIDO_OK',
          severity: 'BAIXA',
          conclusionType: 'Fechado sem validação de regra de rota (configuração)',
        },
      });

      return updated;
    }

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
        const endLocal = await this.prisma.location.findUnique({ where: { id: input.localId }, select: { name: true } });
        await this.alertsService.create({
          type: 'ATENCAO_ROTA',
          plate: input.plate,
          tripId: updated.id,
          readingId: input.readingId,
          severity: resolvedSeverity,
          message: `Rota de atenção: ${openTrip.startLocal?.name ?? openTrip.startLocalId} -> ${endLocal?.name ?? input.localId}`,
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
        const endLocal = await this.prisma.location.findUnique({ where: { id: input.localId }, select: { name: true } });
        await this.alertsService.create({
          type: 'CANCELADO',
          plate: input.plate,
          tripId: updated.id,
          readingId: input.readingId,
          severity: resolvedSeverity,
          message: `Trajeto cancelado: ${openTrip.startLocal?.name ?? openTrip.startLocalId} -> ${endLocal?.name ?? input.localId}`,
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

    const inconsistentEndLocal = await this.prisma.location.findUnique({ where: { id: input.localId }, select: { name: true } });

    await this.alertsService.create({
      type: 'INCONSISTENTE',
      plate: input.plate,
      tripId: inconsistent.id,
      readingId: input.readingId,
      severity: 'ALTA',
      message: `Veículo saiu do ${openTrip.startLocal?.name ?? openTrip.startLocalId} e foi para o ${inconsistentEndLocal?.name ?? input.localId}. Rota sem regra cadastrada.`,
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
