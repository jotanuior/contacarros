import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class RouteRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.routeRule.findMany({ include: { originLocal: true, destinationLocal: true }, orderBy: { createdAt: 'desc' } });
  }

  create(data: {
    originLocalId: string;
    destinationLocalId: string;
    resultType: 'CONCLUIDO_OK' | 'CONCLUIDO_ATENCAO' | 'CANCELADO' | 'INCONSISTENTE' | 'PENDENTE_VALIDACAO';
    severity: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
    active?: boolean;
    description?: string;
  }) {
    return this.prisma.routeRule.upsert({
      where: {
        originLocalId_destinationLocalId: {
          originLocalId: data.originLocalId,
          destinationLocalId: data.destinationLocalId,
        },
      },
      update: data,
      create: data,
    });
  }

  findRule(originLocalId: string, destinationLocalId: string) {
    return this.prisma.routeRule.findUnique({
      where: {
        originLocalId_destinationLocalId: { originLocalId, destinationLocalId },
      },
    });
  }
}
