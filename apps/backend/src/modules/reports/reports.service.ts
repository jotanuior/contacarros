import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { Parser } from 'json2csv';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { SettingsService } from '../settings/settings.service';

type QuantitativeRow = {
  tipo: string;
  subtipo: string;
  quantidade: number;
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

  private async buildQuantitativeRows(
    start: Date,
    end: Date,
    tipo?: string,
    subtipo?: string,
  ): Promise<QuantitativeRow[]> {
    const where: import('@prisma/client').Prisma.HeavyVehicleCheckWhereInput = {
      checkedAt: { gte: start, lte: end },
    };

    if (tipo) {
      where.vehicle = { categoryType: tipo as import('@prisma/client').VehicleCategoryType };
    }

    if (subtipo) {
      where.subtype = { contains: subtipo, mode: 'insensitive' };
    }

    const checks = await this.prisma.heavyVehicleCheck.findMany({
      where,
      include: { vehicle: { select: { categoryType: true } } },
    });

    const map = new Map<string, QuantitativeRow>();

    for (const item of checks) {
      const tipo = this.toDisplayType(item.vehicle?.categoryType || 'DESCONHECIDO');
      const subtipo = item.subtype?.trim() || 'Não informado';
      const key = `${tipo}::${subtipo}`;
      const current = map.get(key);

      if (current) {
        current.quantidade += 1;
      } else {
        map.set(key, { tipo, subtipo, quantidade: 1 });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const typeOrder = a.tipo.localeCompare(b.tipo, 'pt-BR');
      if (typeOrder !== 0) return typeOrder;
      return a.subtipo.localeCompare(b.subtipo, 'pt-BR');
    });
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

  async getQuantitative(from?: string, to?: string, tipo?: string, subtipo?: string) {
    const { start, end } = this.resolvePeriod(from, to);
    const rows = await this.buildQuantitativeRows(start, end, tipo, subtipo);
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

  async getQuantitativeCsv(from?: string, to?: string, tipo?: string, subtipo?: string) {
    const result = await this.getQuantitative(from, to, tipo, subtipo);
    const parser = new Parser({ fields: ['tipo', 'subtipo', 'quantidade'] });
    return parser.parse(result.rows);
  }

  async getQuantitativeXls(from?: string, to?: string, tipo?: string, subtipo?: string) {
    const result = await this.getQuantitative(from, to, tipo, subtipo);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Quantitativo');

    // Header metadata rows
    sheet.addRow(['Período:', this.periodText(result.period.from, result.period.to)]);
    if (tipo) sheet.addRow(['Tipo:', this.toDisplayType(tipo)]);
    if (subtipo) sheet.addRow(['Subtipo:', subtipo]);
    sheet.addRow([]);

    const tableHeaderRow = sheet.addRow(['Tipo', 'Subtipo', 'Quantidade']);
    tableHeaderRow.font = { bold: true };

    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 35;
    sheet.getColumn(3).width = 14;

    result.rows.forEach((row) => {
      sheet.addRow([row.tipo, row.subtipo, row.quantidade]);
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(['TOTAL', '', result.total]);
    totalRow.font = { bold: true };

    const fileName = `quantitativo_tipo_subtipo_${this.formatDateFileToken(result.period.from)}_${this.formatDateFileToken(result.period.to)}.xlsx`;
    const output = await workbook.xlsx.writeBuffer();

    return {
      fileName,
      buffer: Buffer.isBuffer(output) ? output : Buffer.from(output),
    };
  }

  async getQuantitativePdf(from?: string, to?: string, tipo?: string, subtipo?: string) {
    const result = await this.getQuantitative(from, to, tipo, subtipo);
    const fileName = `quantitativo_tipo_subtipo_${this.formatDateFileToken(result.period.from)}_${this.formatDateFileToken(result.period.to)}.pdf`;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer | Uint8Array) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(14).text('Relatório quantitativo por tipo e subtipo');
      doc.moveDown(0.4);
      doc.fontSize(10).text(`Período: ${this.periodText(result.period.from, result.period.to)}`);
      if (tipo) doc.fontSize(10).text(`Tipo: ${this.toDisplayType(tipo)}`);
      if (subtipo) doc.fontSize(10).text(`Subtipo: ${subtipo}`);
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Total no período: ${result.total}`);
      doc.moveDown(0.6);

      let y = doc.y;
      const colTipo = 36;
      const colSubtipo = 190;
      const colQuantidade = 500;

      doc.fontSize(11).text('Tipo', colTipo, y);
      doc.text('Subtipo', colSubtipo, y);
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
          doc.text('Subtipo', colSubtipo, y);
          doc.text('Quantidade', colQuantidade, y, { width: 60, align: 'right' });
          y += 18;
          doc.moveTo(colTipo, y - 4).lineTo(560, y - 4).stroke('#94a3b8');
        }

        doc.fontSize(10).text(row.tipo, colTipo, y, { width: 140 });
        doc.text(row.subtipo, colSubtipo, y, { width: 290 });
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
}
