import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Parser } from 'json2csv';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getData(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const [readings, trips, alerts, heavyChecks] = await Promise.all([
      this.prisma.reading.findMany({ where: { capturedAt: fromDate || toDate ? { gte: fromDate, lte: toDate } : undefined }, include: { vehicle: true, location: true, camera: true } }),
      this.prisma.trip.findMany({ where: { startedAt: fromDate || toDate ? { gte: fromDate, lte: toDate } : undefined }, include: { startLocal: true, endLocal: true, vehicle: true } }),
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
}
