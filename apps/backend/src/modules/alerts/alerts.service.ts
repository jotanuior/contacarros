import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    type: 'SEM_SAIDA' | 'CANCELADO' | 'ATENCAO_ROTA' | 'INCONSISTENTE' | 'LEITURA_BAIXA_CONFIANCA' | 'FALHA_API';
    plate: string;
    tripId?: string;
    readingId?: string;
    severity: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
    message: string;
  }) {
    return this.prisma.alert.create({ data });
  }

  async list(
    params: { plate?: string; isResolved?: boolean; severity?: string; type?: string },
    pagination: PaginationDto = {},
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = {
      plate: params.plate ? { contains: params.plate, mode: 'insensitive' as const } : undefined,
      isResolved: params.isResolved,
      severity: params.severity as any,
      type: params.type as any,
    };
    const [data, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        include: { trip: true, reading: true, resolvedByUser: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.alert.count({ where }),
    ]);
    return PaginatedResponse.of(data, total, page, limit);
  }

  resolve(id: string, userId: string) {
    return this.prisma.alert.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedByUserId: userId,
        resolvedAt: new Date(),
      },
    });
  }
}
