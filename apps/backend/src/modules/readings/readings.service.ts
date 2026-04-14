import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';
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

type ImportIntelbrasCsvInput = {
  csvText: string;
  cameraCode: string;
  delimiter?: string;
  defaultConfidence?: number;
};

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

  private shouldApplyCameraTypeMapping(categoryType?: string | null) {
    return !categoryType || categoryType === 'DESCONHECIDO' || categoryType === 'OUTRO';
  }

  private getByPath(source: unknown, segments: Array<string | number>): unknown {
    let current: unknown = source;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof segment === 'number') {
        if (!Array.isArray(current)) {
          return undefined;
        }

        current = current[segment];
        continue;
      }

      if (typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private getMediaBasePath() {
    const basePath = process.env.APP_BASE_PATH || '/api';
    if (!basePath || basePath === '/') {
      return '/api';
    }

    const normalized = `/${basePath.replace(/^\/+|\/+$/g, '')}`;
    if (normalized.endsWith('/api')) {
      return normalized;
    }

    return `${normalized}/api`;
  }

  private getPlateImageUrl(plate: string) {
    return `${this.getMediaBasePath()}/media/vehicles/${plate}.jpg`;
  }

  private async persistCameraImageIfMissing(plate: string, rawPayload?: Record<string, unknown>) {
    if (!rawPayload) {
      return undefined;
    }

    const candidates = [
      this.getByPath(rawPayload, ['Picture', 'NormalPic', 'Content']),
      this.getByPath(rawPayload, ['Picture', 'PlatePic', 'Content']),
      this.getByPath(rawPayload, ['Picture', 'PicInfo', 'Content']),
    ];

    const base64Content = candidates.find(
      (item): item is string => typeof item === 'string' && item.trim().length > 100,
    );

    if (!base64Content) {
      return undefined;
    }

    const sanitized = base64Content.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s+/g, '');
    if (!sanitized) {
      return undefined;
    }

    const outputDir = path.join(process.cwd(), 'storage', 'media', 'vehicles');
    const filePath = path.join(outputDir, `${plate}.jpg`);

    await fs.mkdir(outputDir, { recursive: true });

    try {
      await fs.access(filePath);
      return this.getPlateImageUrl(plate);
    } catch {
      // File does not exist; continue and create it.
    }

    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(sanitized, 'base64');
    } catch {
      return undefined;
    }

    if (!imageBuffer.length) {
      return undefined;
    }

    try {
      await fs.writeFile(filePath, imageBuffer, { flag: 'wx' });
    } catch (error: unknown) {
      if (!(error instanceof Error) || !('code' in error) || (error as { code?: string }).code !== 'EEXIST') {
        throw error;
      }
    }

    return this.getPlateImageUrl(plate);
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

    if (reading.eventKey) {
      const existingByEventKey = await this.prisma.reading.findUnique({
        where: { eventKey: reading.eventKey },
        include: { vehicle: true, location: true, camera: true },
      });

      if (existingByEventKey) {
        return existingByEventKey;
      }
    }

    const capturedAt = new Date(reading.capturedAt);
    const dedupMinutes = await this.settingsService.getNumber('DEDUP_MINUTES', 2);
    const dedupSince = new Date(capturedAt.getTime() - dedupMinutes * 60 * 1000);
    const plateImageUrl = await this.persistCameraImageIfMissing(normalizedPlate, reading.rawPayload);
    const imageUrl = reading.imageUrl || plateImageUrl;

    const duplicateExists = await this.prisma.reading.findFirst({
      where: {
        normalizedPlate,
        cameraId: camera.id,
        capturedAt: { gte: dedupSince, lte: capturedAt },
      },
      orderBy: { capturedAt: 'desc' },
    });

    let createdReading;

    try {
      createdReading = await this.prisma.reading.create({
        data: {
          plate: reading.plate,
          normalizedPlate,
          eventKey: reading.eventKey,
          cameraId: camera.id,
          localId: camera.locationId,
          capturedAt,
          confidence: reading.confidence,
          imageUrl,
          rawPayload: (reading.rawPayload || {}) as Prisma.InputJsonValue,
          isDuplicate: !!duplicateExists,
          processingStatus: duplicateExists ? 'DUPLICADO' : 'RECEBIDO',
        },
        include: { location: true, camera: true },
      });
    } catch (error) {
      if (
        reading.eventKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingByEventKey = await this.prisma.reading.findUnique({
          where: { eventKey: reading.eventKey },
          include: { vehicle: true, location: true, camera: true },
        });

        if (existingByEventKey) {
          return existingByEventKey;
        }
      }

      throw error;
    }

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

    const trackedCameraVehicleType = reading.cameraVehicleType
      ? await this.settingsService.trackCameraVehicleType({
          rawType: reading.cameraVehicleType,
          brand: reading.cameraVehicleBrand,
          direction: reading.cameraDirection,
          plateColor: reading.plateColor,
        })
      : null;

    let vehicle = await this.vehiclesService.ensure(normalizedPlate);
    const hasLocalVehicleData = Boolean(
      vehicle.brand ||
      vehicle.model ||
      (vehicle.categoryType && vehicle.categoryType !== 'DESCONHECIDO'),
    );

    const apiData = await this.placaFipeService.fetchVehicleData(normalizedPlate);
    if (apiData) {
      const categoryType = this.placaFipeService.classifyCategory(apiData);
      vehicle = await this.vehiclesService.upsertFromApi(normalizedPlate, apiData, categoryType);
      if (trackedCameraVehicleType?.mappedCategory && this.shouldApplyCameraTypeMapping(vehicle.categoryType)) {
        vehicle = await this.vehiclesService.applyCameraTypeMapping(normalizedPlate, {
          categoryType: trackedCameraVehicleType.mappedCategory as 'CARRO' | 'CAMINHAO' | 'ONIBUS',
          subtype: trackedCameraVehicleType.mappedSubtype,
        });
      }
      await this.prisma.reading.update({
        where: { id: createdReading.id },
        data: { vehicleId: vehicle.id, processingStatus: 'PROCESSADO' },
      });
    } else if (trackedCameraVehicleType?.mappedCategory && this.shouldApplyCameraTypeMapping(vehicle.categoryType)) {
      vehicle = await this.vehiclesService.applyCameraTypeMapping(normalizedPlate, {
        categoryType: trackedCameraVehicleType.mappedCategory as 'CARRO' | 'CAMINHAO' | 'ONIBUS',
        subtype: trackedCameraVehicleType.mappedSubtype,
      });
      await this.prisma.reading.update({
        where: { id: createdReading.id },
        data: { vehicleId: vehicle.id, processingStatus: 'PROCESSADO' },
      });
    } else if (hasLocalVehicleData) {
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

    if (vehicle.categoryType === 'OUTRO') {
      const existingCategoryAlert = await this.prisma.alert.findFirst({
        where: {
          plate: normalizedPlate,
          type: 'INCONSISTENTE',
          isResolved: false,
          message: {
            contains: 'Categoria OUTRO',
          },
        },
      });

      if (!existingCategoryAlert) {
        await this.alertsService.create({
          type: 'INCONSISTENTE',
          plate: normalizedPlate,
          readingId: createdReading.id,
          severity: 'MEDIA',
          message: `Categoria OUTRO para placa ${normalizedPlate}. Revisar e recategorizar veículo.`,
        });
      }
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

  async importIntelbrasCsv(input: ImportIntelbrasCsvInput) {
    const csvText = input.csvText?.trim();
    if (!csvText) {
      throw new BadRequestException('CSV vazio');
    }

    const delimiter = input.delimiter || this.detectDelimiter(csvText);
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      throw new BadRequestException('CSV sem linhas de dados');
    }

    const headers = this.parseCsvLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
    const plateIdx = headers.findIndex((h) => h === 'placa');
    const timeIdx = headers.findIndex((h) => h === 'tempo');

    if (plateIdx < 0 || timeIdx < 0) {
      throw new BadRequestException('CSV Intelbras inválido: colunas "Placa" e "Tempo" são obrigatórias');
    }

    const readings: LprReadingDto[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const row = this.parseCsvLine(lines[i], delimiter);
      const plate = (row[plateIdx] || '').trim();
      const timeRaw = (row[timeIdx] || '').trim();

      if (!plate || !timeRaw) {
        continue;
      }

      const capturedAt = this.parseIntelbrasDate(timeRaw);
      if (!capturedAt) {
        continue;
      }

      readings.push({
        plate,
        cameraCode: input.cameraCode,
        capturedAt,
        confidence: input.defaultConfidence,
        rawPayload: {
          source: 'intelbras_csv_import',
          rowNumber: i + 1,
          row,
        },
      });
    }

    if (!readings.length) {
      throw new BadRequestException('Nenhuma leitura válida encontrada no CSV');
    }

    const results = await this.ingestBatch(readings);
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.length - successCount;

    return {
      totalRows: lines.length - 1,
      parsedReadings: readings.length,
      imported: successCount,
      failed: failedCount,
      errors: results.filter((r) => !r.success).slice(0, 20),
    };
  }

  private detectDelimiter(csvText: string): string {
    const firstLine = csvText.split(/\r?\n/, 1)[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    return semicolonCount > commaCount ? ';' : ',';
  }

  private parseCsvLine(line: string, delimiter: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && ch === delimiter) {
        fields.push(current.trim());
        current = '';
        continue;
      }

      current += ch;
    }

    fields.push(current.trim());
    return fields;
  }

  private parseIntelbrasDate(input: string): string | undefined {
    const match = input.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) {
      return undefined;
    }

    const [, dd, mm, yyyy, hh, mi, ss] = match;
    const date = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss),
    );

    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return date.toISOString();
  }

  async list(
    filters: { plate?: string; localId?: string; cameraId?: string; from?: Date; to?: Date; lowConfidence?: boolean; categoryType?: string; subSegment?: string },
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
    const where = this.buildReadingWhere(filters, from, to);
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

  private buildReadingWhere(
    filters: { plate?: string; localId?: string; cameraId?: string; lowConfidence?: boolean; categoryType?: string; subSegment?: string },
    from: Date,
    to: Date,
  ): Prisma.ReadingWhereInput {
    const vehicleFilter: Prisma.VehicleWhereInput = {};
    if (filters.categoryType) {
      vehicleFilter.categoryType = filters.categoryType as Prisma.EnumVehicleCategoryTypeFilter['equals'];
    }
    if (filters.subSegment) {
      vehicleFilter.subSegment = { contains: filters.subSegment, mode: 'insensitive' };
    }
    const hasVehicleFilter = Object.keys(vehicleFilter).length > 0;

    return {
      normalizedPlate: filters.plate ? { contains: filters.plate.toUpperCase() } : undefined,
      localId: filters.localId,
      cameraId: filters.cameraId,
      capturedAt: { gte: from, lte: to },
      confidence: filters.lowConfidence ? { lt: 0.8 } : undefined,
      vehicle: hasVehicleFilter ? vehicleFilter : undefined,
    };
  }

  async exportReadingsCsv(
    filters: { plate?: string; localId?: string; cameraId?: string; from?: Date; to?: Date; lowConfidence?: boolean; categoryType?: string; subSegment?: string },
  ) {
    const to = filters.to ?? new Date();
    const from = filters.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const where = this.buildReadingWhere(filters, from, to);

    const readings = await this.prisma.reading.findMany({
      where,
      include: { vehicle: true, location: true, camera: true },
      orderBy: { capturedAt: 'desc' },
      take: 5000,
    });

    const parser = new Parser({
      fields: ['capturedAt', 'plate', 'tipo', 'subtipo', 'local', 'camera', 'confianca', 'duplicada', 'status'],
    });

    const rows = readings.map((r) => ({
      capturedAt: r.capturedAt.toISOString(),
      plate: r.normalizedPlate,
      tipo: r.vehicle?.categoryType ?? '-',
      subtipo: r.vehicle?.subSegment ?? '-',
      local: (r as any).location?.name ?? '-',
      camera: (r as any).camera?.name ?? '-',
      confianca: r.confidence ?? '-',
      duplicada: r.isDuplicate ? 'Sim' : 'Não',
      status: r.processingStatus,
    }));

    return parser.parse(rows);
  }

  async exportReadingsPdf(
    filters: { plate?: string; localId?: string; cameraId?: string; from?: Date; to?: Date; lowConfidence?: boolean; categoryType?: string; subSegment?: string },
  ) {
    const to = filters.to ?? new Date();
    const from = filters.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const where = this.buildReadingWhere(filters, from, to);

    const readings = await this.prisma.reading.findMany({
      where,
      include: { vehicle: true, location: true, camera: true },
      orderBy: { capturedAt: 'desc' },
      take: 2000,
    });

    const fmt = (d: Date) =>
      d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer | Uint8Array) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(13).text('Relatório de Leituras');
      doc.fontSize(9).text(`Período: ${fmt(from)} até ${fmt(to)}`);
      if (filters.plate) doc.text(`Placa: ${filters.plate}`);
      if (filters.categoryType) doc.text(`Tipo: ${filters.categoryType}`);
      if (filters.subSegment) doc.text(`Subtipo: ${filters.subSegment}`);
      doc.text(`Total: ${readings.length}`);
      doc.moveDown(0.5);

      const cols = { date: 30, plate: 135, tipo: 220, subtipo: 295, local: 400, camera: 505, conf: 590, status: 640 };
      let y = doc.y;

      const drawHeader = () => {
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Data/hora', cols.date, y, { width: 100 });
        doc.text('Placa', cols.plate, y, { width: 80 });
        doc.text('Tipo', cols.tipo, y, { width: 70 });
        doc.text('Subtipo', cols.subtipo, y, { width: 100 });
        doc.text('Local', cols.local, y, { width: 100 });
        doc.text('Câmera', cols.camera, y, { width: 80 });
        doc.text('Conf.', cols.conf, y, { width: 45 });
        doc.text('Status', cols.status, y, { width: 80 });
        y += 14;
        doc.moveTo(cols.date, y - 2).lineTo(750, y - 2).stroke('#94a3b8');
        doc.font('Helvetica');
      };

      drawHeader();

      for (const r of readings) {
        if (y > 530) {
          doc.addPage();
          y = 30;
          drawHeader();
        }
        doc.fontSize(7);
        doc.text(fmt(r.capturedAt), cols.date, y, { width: 100 });
        doc.text(r.normalizedPlate, cols.plate, y, { width: 80 });
        doc.text((r as any).vehicle?.categoryType ?? '-', cols.tipo, y, { width: 70 });
        doc.text((r as any).vehicle?.subSegment ?? '-', cols.subtipo, y, { width: 100 });
        doc.text((r as any).location?.name ?? '-', cols.local, y, { width: 100 });
        doc.text((r as any).camera?.name ?? '-', cols.camera, y, { width: 80 });
        doc.text(r.confidence != null ? String(r.confidence) : '-', cols.conf, y, { width: 45 });
        doc.text(r.processingStatus, cols.status, y, { width: 80 });
        y += 12;
      }

      doc.end();
    });

    return buffer;
  }
}
