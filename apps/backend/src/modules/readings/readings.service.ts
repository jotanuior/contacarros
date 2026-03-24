import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';
import { LprReadingDto } from './dto';
import { CamerasService } from '../cameras/cameras.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { PlacaFipeService } from '../integrations/placa-fipe.service';
import { TripsService } from '../trips/trips.service';
import { AlertsService } from '../alerts/alerts.service';
import { SettingsService } from '../settings/settings.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class ReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly camerasService: CamerasService,
    private readonly vehiclesService: VehiclesService,
    private readonly placaFipeService: PlacaFipeService,
    private readonly tripsService: TripsService,
    private readonly alertsService: AlertsService,
    private readonly settingsService: SettingsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  normalizePlate(input: string) {
    return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  isValidPlate(plate: string) {
    return /^[A-Z]{3}[0-9]{4}$/.test(plate) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(plate);
  }

  async ingest(reading: LprReadingDto) {
    const normalizedPlate = this.normalizePlate(reading.plate);

    if (!this.isValidPlate(normalizedPlate)) {
      throw new BadRequestException('Placa inválida');
    }

    const camera = await this.camerasService.findByCode(reading.cameraCode);
    if (!camera || !camera.active) {
      throw new BadRequestException('Câmera inválida/inativa');
    }

    const capturedAt = new Date(reading.capturedAt);
    const dedupMinutes = await this.settingsService.getNumber('DEDUP_MINUTES', 2);
    const dedupSince = new Date(capturedAt.getTime() - dedupMinutes * 60 * 1000);

    const duplicateExists = await this.prisma.reading.findFirst({
      where: {
        normalizedPlate,
        cameraId: camera.id,
        capturedAt: { gte: dedupSince, lte: capturedAt },
      },
      orderBy: { capturedAt: 'desc' },
    });

    const createdReading = await this.prisma.reading.create({
      data: {
        plate: reading.plate,
        normalizedPlate,
        cameraId: camera.id,
        localId: camera.locationId,
        capturedAt,
        confidence: reading.confidence,
        imageUrl: reading.imageUrl,
        rawPayload: (reading.rawPayload || {}) as Prisma.InputJsonValue,
        isDuplicate: !!duplicateExists,
        processingStatus: duplicateExists ? 'DUPLICADO' : 'RECEBIDO',
      },
      include: { location: true, camera: true },
    });

    await this.auditLogs.create({
      action: 'LPR_READING_RECEIVED',
      entityType: 'Reading',
      entityId: createdReading.id,
      description: `Leitura recebida ${normalizedPlate}`,
      afterData: createdReading,
    });

    if (duplicateExists) {
      return createdReading;
    }

    let vehicle = await this.vehiclesService.ensure(normalizedPlate);

    const apiData = await this.placaFipeService.fetchVehicleData(normalizedPlate);
    if (apiData) {
      const categoryType = this.placaFipeService.classifyCategory(apiData);
      vehicle = await this.vehiclesService.upsertFromApi(normalizedPlate, apiData, categoryType);
      await this.prisma.reading.update({
        where: { id: createdReading.id },
        data: { vehicleId: vehicle.id, processingStatus: 'PROCESSADO' },
      });
    } else {
      await this.prisma.reading.update({
        where: { id: createdReading.id },
        data: { vehicleId: vehicle.id, processingStatus: 'PENDENTE_API' },
      });
      await this.alertsService.create({
        type: 'FALHA_API',
        plate: normalizedPlate,
        readingId: createdReading.id,
        severity: 'MEDIA',
        message: `Falha ao enriquecer placa ${normalizedPlate}`,
      });
    }

    const minConfidence = await this.settingsService.getNumber('MIN_CONFIDENCE', 0.8);
    if (typeof reading.confidence === 'number' && reading.confidence < minConfidence) {
      await this.alertsService.create({
        type: 'LEITURA_BAIXA_CONFIANCA',
        plate: normalizedPlate,
        readingId: createdReading.id,
        severity: 'MEDIA',
        message: `Leitura com baixa confiança (${reading.confidence})`,
      });
    }

    await this.tripsService.processReading({
      plate: normalizedPlate,
      vehicleId: vehicle.id,
      readingId: createdReading.id,
      localId: camera.locationId,
      cameraId: camera.id,
      capturedAt,
    });

    return this.prisma.reading.findUnique({
      where: { id: createdReading.id },
      include: { vehicle: true, location: true, camera: true },
    });
  }

  async ingestBatch(readings: LprReadingDto[]) {
    const results = [];
    for (const item of readings) {
      try {
        const processed = await this.ingest(item);
        results.push({ success: true, data: processed });
      } catch (error: any) {
        results.push({
          success: false,
          plate: item.plate,
          cameraCode: item.cameraCode,
          error: error?.message || 'Erro inesperado',
        });
      }
    }

    return results;
  }

  async list(
    filters: { plate?: string; localId?: string; cameraId?: string; from?: Date; to?: Date; lowConfidence?: boolean },
    pagination: PaginationDto = {},
  ) {
    const now = new Date();
    const to = filters.to ?? now;
    const from = filters.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (from > to) {
      throw new BadRequestException('Período inválido: "from" deve ser menor ou igual a "to"');
    }

    const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxRangeMs) {
      throw new BadRequestException('Período máximo permitido é de 90 dias');
    }

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where: Prisma.ReadingWhereInput = {
      normalizedPlate: filters.plate ? { contains: filters.plate.toUpperCase() } : undefined,
      localId: filters.localId,
      cameraId: filters.cameraId,
      capturedAt: { gte: from, lte: to },
      confidence: filters.lowConfidence ? { lt: 0.8 } : undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.reading.findMany({
        where,
        include: { vehicle: true, location: true, camera: true },
        orderBy: { capturedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reading.count({ where }),
    ]);
    return PaginatedResponse.of(data, total, page, limit);
  }
}
