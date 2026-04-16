import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { Parser } from 'json2csv';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { SettingsService } from '../settings/settings.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';

type QuantitativeRow = {
  tipo: string;
  quantidade: number;
};

type ReportFilters = {
  from?: string;
  to?: string;
  tipo?: string;
  plate?: string;
  localId?: string;
  cameraId?: string;
  isGratuidade?: boolean;
};

type DescriptiveRow = {
  capturedAt: Date;
  plate: string;
  tipo: string;
  marcaModelo: string;
  local: string;
  camera: string;
  confianca: string;
  status: string;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  private async buildTripWhere(fromDate?: Date, toDate?: Date): Promise<Prisma.TripWhereInput> {
    const requireHeavyValidation = await this.settingsService.getBoolean('HEAVY_TRIPS_REQUIRE_VALIDATION', true);

    const baseWhere: Prisma.TripWhereInput = {
      startedAt: fromDate || toDate ? { gte: fromDate, lte: toDate } : undefined,
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
        { tripEvents: { some: { reading: { heavyChecks: { some: {} } } } } },
      ],
    };
  }

  private readonly typeLabels: Record<string, string> = {
    CARRO: 'Carro',
    CAMINHAO: 'Caminhão',
    ONIBUS: 'Ônibus',
    OUTRO: 'Outro',
    DESCONHECIDO: 'Desconhecido',
  };

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

  private resolvePeriod(from?: string, to?: string) {
    const parsedFrom = from ? this.parseDateBoundary(from, false) : null;
    const parsedTo = to ? this.parseDateBoundary(to, true) : null;

    let start: Date;
    let end: Date;

    if (parsedFrom || parsedTo) {
      const now = new Date();
      start = parsedFrom || new Date(parsedTo || now);
      end = parsedTo || new Date(parsedFrom || now);

      if (!parsedFrom) start.setUTCHours(0, 0, 0, 0);
      if (!parsedTo) end.setUTCHours(23, 59, 59, 999);
    } else {
      start = new Date();
      start.setHours(0, 0, 0, 0);
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }

    return { start, end };
  }

  private toDisplayType(type: string) {
    return this.typeLabels[type] || type;
  }

  private buildReadingWhere(start: Date, end: Date, filters: Omit<ReportFilters, 'from' | 'to'>): Prisma.ReadingWhereInput {
    const vehicleFilter: Prisma.VehicleWhereInput = {};
    if (filters.tipo) {
      vehicleFilter.categoryType = filters.tipo as Prisma.EnumVehicleCategoryTypeFilter['equals'];
    }
    if (filters.isGratuidade !== undefined) {
      vehicleFilter.isGratuidade = filters.isGratuidade;
    }

    return {
      capturedAt: { gte: start, lte: end },
      normalizedPlate: filters.plate ? { contains: filters.plate.toUpperCase() } : undefined,
      localId: filters.localId || undefined,
      cameraId: filters.cameraId || undefined,
      vehicle: Object.keys(vehicleFilter).length ? vehicleFilter : undefined,
    };
  }

  private async buildQuantitativeRows(start: Date, end: Date, filters: Omit<ReportFilters, 'from' | 'to'>): Promise<QuantitativeRow[]> {
    const where = this.buildReadingWhere(start, end, filters);
    const groups = await this.prisma.reading.groupBy({
      by: ['vehicleId'],
      where,
      _count: { _all: true },
    });

    if (!groups.length) {
      return [];
    }

    const vehicleIds = groups.map((group) => group.vehicleId).filter((id): id is string => Boolean(id));
    const vehicles = vehicleIds.length
      ? await this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, categoryType: true } })
      : [];
    const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

    const typeMap = new Map<string, number>();
    for (const group of groups) {
      const category = group.vehicleId ? (vehicleMap.get(group.vehicleId)?.categoryType || 'DESCONHECIDO') : 'DESCONHECIDO';
      const label = this.toDisplayType(category);
      typeMap.set(label, (typeMap.get(label) || 0) + group._count._all);
    }

    return Array.from(typeMap.entries())
      .map(([tipo, quantidade]) => ({ tipo, quantidade }))
      .sort((a, b) => a.tipo.localeCompare(b.tipo, 'pt-BR'));
  }

  private formatDateFileToken(date: Date) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private periodText(start: Date, end: Date) {
    return `${start.toLocaleDateString('pt-BR')} ${start.toLocaleTimeString('pt-BR')} até ${end.toLocaleDateString('pt-BR')} ${end.toLocaleTimeString('pt-BR')}`;
  }

  async getData(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const tripWhere = await this.buildTripWhere(fromDate, toDate);

    const [readings, trips, alerts, heavyChecks] = await Promise.all([
      this.prisma.reading.findMany({ where: { capturedAt: fromDate || toDate ? { gte: fromDate, lte: toDate } : undefined }, include: { vehicle: true, location: true, camera: true } }),
      this.prisma.trip.findMany({ where: tripWhere, include: { startLocal: true, endLocal: true, vehicle: true } }),
      this.prisma.alert.findMany({ where: { createdAt: fromDate || toDate ? { gte: fromDate, lte: toDate } : undefined } }),
      this.prisma.heavyVehicleCheck.findMany({ where: { checkedAt: fromDate || toDate ? { gte: fromDate, lte: toDate } : undefined }, include: { checkedByUser: true, vehicle: true } }),
    ]);

    return { readings, trips, alerts, heavyChecks };
  }

  async getCsv(from?: string, to?: string) {
    const data = await this.getData(from, to);
    const parser = new Parser();

    return {
      readings: parser.parse(data.readings.map((item: any) => ({
        capturedAt: item.capturedAt,
        plate: item.normalizedPlate,
        vehicleType: item.vehicle?.categoryType,
        local: item.location?.name,
        camera: item.camera?.name,
        confidence: item.confidence,
        status: item.processingStatus,
      }))),
      trips: parser.parse(data.trips.map((item: any) => ({
        plate: item.plate,
        origin: item.startLocal?.name,
        destination: item.endLocal?.name,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        status: item.currentStatus,
        severity: item.severity,
      }))),
      alerts: parser.parse(data.alerts.map((item: any) => ({
        createdAt: item.createdAt,
        type: item.type,
        plate: item.plate,
        severity: item.severity,
        message: item.message,
        isResolved: item.isResolved,
      }))),
      heavyChecks: parser.parse(data.heavyChecks.map((item: any) => ({
        checkedAt: item.checkedAt,
        plate: item.vehicle.plate,
        type: item.vehicle.categoryType,
        subtype: item.subtype,
        operator: item.checkedByUser.name,
      }))),
    };
  }

  async getQuantitative(filters: ReportFilters = {}) {
    const { start, end } = this.resolvePeriod(filters.from, filters.to);
    const rows = await this.buildQuantitativeRows(start, end, {
      tipo: filters.tipo,
      plate: filters.plate,
      localId: filters.localId,
      cameraId: filters.cameraId,
      isGratuidade: filters.isGratuidade,
    });
    const total = rows.reduce((acc, item) => acc + item.quantidade, 0);

    return {
      period: {
        from: start,
        to: end,
      },
      total,
      rows,
    };
  }

  async getDescriptive(filters: ReportFilters = {}, pagination: PaginationDto = {}) {
    const { start, end } = this.resolvePeriod(filters.from, filters.to);
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = this.buildReadingWhere(start, end, {
      tipo: filters.tipo,
      plate: filters.plate,
      localId: filters.localId,
      cameraId: filters.cameraId,
      isGratuidade: filters.isGratuidade,
    });

    const [data, total] = await Promise.all([
      this.prisma.reading.findMany({
        where,
        select: {
          capturedAt: true,
          normalizedPlate: true,
          confidence: true,
          processingStatus: true,
          vehicle: { select: { categoryType: true, brand: true, model: true } },
          location: { select: { name: true } },
          camera: { select: { name: true } },
        },
        orderBy: { capturedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.reading.count({ where }),
    ]);

    const rows: DescriptiveRow[] = data.map((item) => ({
      capturedAt: item.capturedAt,
      plate: item.normalizedPlate,
      tipo: this.toDisplayType(item.vehicle?.categoryType || 'DESCONHECIDO'),
      marcaModelo: [item.vehicle?.brand, item.vehicle?.model].filter(Boolean).join(' ') || '-',
      local: item.location?.name || '-',
      camera: item.camera?.name || '-',
      confianca: item.confidence != null ? String(item.confidence) : '-',
      status: item.processingStatus,
    }));

    const response = PaginatedResponse.of(rows, total, page, limit) as PaginatedResponse<DescriptiveRow> & {
      period: { from: Date; to: Date };
    };
    response.period = { from: start, to: end };
    return response;
  }

  async getQuantitativeCsv(filters: ReportFilters = {}) {
    const result = await this.getQuantitative(filters);
    const parser = new Parser({ fields: ['tipo', 'quantidade'] });
    return parser.parse(result.rows);
  }

  async getQuantitativeXls(filters: ReportFilters = {}) {
    const result = await this.getQuantitative(filters);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quantitativo');

    // Header metadata rows
    sheet.addRow(['Período:', this.periodText(result.period.from, result.period.to)]);
    if (filters.tipo) sheet.addRow(['Tipo:', this.toDisplayType(filters.tipo)]);
    if (filters.plate) sheet.addRow(['Placa:', filters.plate]);
    sheet.addRow([]);

    const tableHeaderRow = sheet.addRow(['Tipo', 'Quantidade']);
    tableHeaderRow.font = { bold: true };

    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 14;

    result.rows.forEach((row) => {
      sheet.addRow([row.tipo, row.quantidade]);
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(['TOTAL', result.total]);
    totalRow.font = { bold: true };

    const fileName = `relatorio_quantitativo_${this.formatDateFileToken(result.period.from)}_${this.formatDateFileToken(result.period.to)}.xlsx`;
    const output = await workbook.xlsx.writeBuffer();

    return {
      fileName,
      buffer: Buffer.isBuffer(output) ? output : Buffer.from(output),
    };
  }

  async getQuantitativePdf(filters: ReportFilters = {}) {
    const result = await this.getQuantitative(filters);
    const fileName = `relatorio_quantitativo_${this.formatDateFileToken(result.period.from)}_${this.formatDateFileToken(result.period.to)}.pdf`;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer | Uint8Array) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(14).text('Relatório quantitativo por tipo');
      doc.moveDown(0.4);
      doc.fontSize(10).text(`Período: ${this.periodText(result.period.from, result.period.to)}`);
      if (filters.tipo) doc.fontSize(10).text(`Tipo: ${this.toDisplayType(filters.tipo)}`);
      if (filters.plate) doc.fontSize(10).text(`Placa: ${filters.plate}`);
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Total no período: ${result.total}`);
      doc.moveDown(0.6);

      let y = doc.y;
      const colTipo = 36;
      const colQuantidade = 500;

      doc.fontSize(11).text('Tipo', colTipo, y);
      doc.text('Quantidade', colQuantidade, y, { width: 60, align: 'right' });

      y += 18;
      doc.moveTo(colTipo, y - 4).lineTo(560, y - 4).stroke('#94a3b8');

      if (result.rows.length === 0) {
        doc.fontSize(10).text('Nenhum registro encontrado para os filtros informados.', colTipo, y);
        y += 18;
      }

      for (const row of result.rows) {
        if (y > 760) {
          doc.addPage();
          y = 50;
          doc.fontSize(11).text('Tipo', colTipo, y);
          doc.text('Quantidade', colQuantidade, y, { width: 60, align: 'right' });
          y += 18;
          doc.moveTo(colTipo, y - 4).lineTo(560, y - 4).stroke('#94a3b8');
        }

        doc.fontSize(10).text(row.tipo, colTipo, y, { width: 140 });
        doc.text(String(row.quantidade), colQuantidade, y, { width: 60, align: 'right' });
        y += 18;
      }

      doc.end();
    });

    return {
      fileName,
      buffer,
    };
  }

  async getDescriptiveCsv(filters: ReportFilters = {}) {
    const result = await this.getDescriptive(filters, { page: 1, limit: 5000 });
    const parser = new Parser({ fields: ['capturedAt', 'plate', 'tipo', 'marcaModelo', 'local', 'camera', 'confianca', 'status'] });
    return parser.parse(result.data.map((row) => ({
      capturedAt: row.capturedAt.toISOString(),
      plate: row.plate,
      tipo: row.tipo,
      marcaModelo: row.marcaModelo,
      local: row.local,
      camera: row.camera,
      confianca: row.confianca,
      status: row.status,
    })));
  }

  async getDescriptiveXls(filters: ReportFilters = {}) {
    const result = await this.getDescriptive(filters, { page: 1, limit: 5000 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Descritivo');

    sheet.addRow(['Período:', this.periodText(result.period.from, result.period.to)]);
    if (filters.tipo) sheet.addRow(['Tipo:', this.toDisplayType(filters.tipo)]);
    if (filters.plate) sheet.addRow(['Placa:', filters.plate]);
    sheet.addRow([]);

    const tableHeaderRow = sheet.addRow(['Data/hora', 'Placa', 'Tipo', 'Marca/Modelo', 'Local', 'Câmera', 'Confiança', 'Status']);
    tableHeaderRow.font = { bold: true };
    sheet.columns = [
      { width: 22 },
      { width: 14 },
      { width: 14 },
      { width: 34 },
      { width: 22 },
      { width: 22 },
      { width: 12 },
      { width: 18 },
    ];

    result.data.forEach((row) => {
      sheet.addRow([
        row.capturedAt.toISOString(),
        row.plate,
        row.tipo,
        row.marcaModelo,
        row.local,
        row.camera,
        row.confianca,
        row.status,
      ]);
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(['TOTAL FILTRADO', result.total]);
    totalRow.font = { bold: true };

    const fileName = `relatorio_descritivo_${this.formatDateFileToken(result.period.from)}_${this.formatDateFileToken(result.period.to)}.xlsx`;
    const output = await workbook.xlsx.writeBuffer();

    return {
      fileName,
      buffer: Buffer.isBuffer(output) ? output : Buffer.from(output),
    };
  }

  async getDescriptivePdf(filters: ReportFilters = {}) {
    const result = await this.getDescriptive(filters, { page: 1, limit: 2000 });
    const fileName = `relatorio_descritivo_${this.formatDateFileToken(result.period.from)}_${this.formatDateFileToken(result.period.to)}.pdf`;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 24, layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(14).text('Relatório descritivo de veículos');
      doc.fontSize(10).text(`Período: ${this.periodText(result.period.from, result.period.to)}`);
      doc.text(`Total filtrado: ${result.total}`);
      doc.moveDown(0.5);

      const cols = { dataHora: 24, plate: 128, tipo: 190, marcaModelo: 250, local: 430, camera: 545, conf: 660, status: 720 };
      let y = doc.y;

      const drawHeader = () => {
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Data/hora', cols.dataHora, y, { width: 95 });
        doc.text('Placa', cols.plate, y, { width: 55 });
        doc.text('Tipo', cols.tipo, y, { width: 55 });
        doc.text('Marca/Modelo', cols.marcaModelo, y, { width: 170 });
        doc.text('Local', cols.local, y, { width: 105 });
        doc.text('Câmera', cols.camera, y, { width: 105 });
        doc.text('Conf.', cols.conf, y, { width: 50 });
        doc.text('Status', cols.status, y, { width: 70 });
        y += 14;
        doc.moveTo(cols.dataHora, y - 2).lineTo(790, y - 2).stroke('#94a3b8');
        doc.font('Helvetica');
      };

      drawHeader();
      for (const row of result.data) {
        if (y > 540) {
          doc.addPage();
          y = 24;
          drawHeader();
        }

        doc.fontSize(7);
        doc.text(row.capturedAt.toISOString(), cols.dataHora, y, { width: 95 });
        doc.text(row.plate, cols.plate, y, { width: 55 });
        doc.text(row.tipo, cols.tipo, y, { width: 55 });
        doc.text(row.marcaModelo, cols.marcaModelo, y, { width: 170 });
        doc.text(row.local, cols.local, y, { width: 105 });
        doc.text(row.camera, cols.camera, y, { width: 105 });
        doc.text(row.confianca, cols.conf, y, { width: 50 });
        doc.text(row.status, cols.status, y, { width: 70 });
        y += 12;
      }

      doc.end();
    });

    return { fileName, buffer };
  }
}
