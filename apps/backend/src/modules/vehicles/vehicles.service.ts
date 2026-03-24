import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { plate?: string; categoryType?: string } = {}, pagination: PaginationDto = {}) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = {
      plate: params.plate ? { contains: params.plate, mode: 'insensitive' as const } : undefined,
      categoryType: params.categoryType as any,
    };
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return PaginatedResponse.of(data, total, page, limit);
  }

  async upsertFromApi(plate: string, data: any, categoryType: string) {
    return this.prisma.vehicle.upsert({
      where: { plate },
      update: {
        brand: data?.marca || data?.brand,
        model: data?.modelo || data?.model,
        year: data?.ano ? `${data.ano}` : undefined,
        segment: data?.segmento,
        subSegment: data?.sub_segmento,
        fuel: data?.combustivel,
        city: data?.municipio,
        state: data?.uf,
        categoryType: categoryType as any,
        lastApiSyncAt: new Date(),
        apiRawData: data,
      },
      create: {
        plate,
        brand: data?.marca || data?.brand,
        model: data?.modelo || data?.model,
        year: data?.ano ? `${data.ano}` : undefined,
        segment: data?.segmento,
        subSegment: data?.sub_segmento,
        fuel: data?.combustivel,
        city: data?.municipio,
        state: data?.uf,
        categoryType: categoryType as any,
        lastApiSyncAt: new Date(),
        apiRawData: data,
      },
    });
  }

  async ensure(plate: string) {
    return this.prisma.vehicle.upsert({
      where: { plate },
      update: {},
      create: { plate },
    });
  }
}
