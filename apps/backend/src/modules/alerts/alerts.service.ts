import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async decide(id: string, userId: string, decision: 'ACEITAR' | 'NEGAR', justification: string) {
    const normalizedJustification = justification.trim();
    if (!normalizedJustification) {
      throw new BadRequestException('Justificativa é obrigatória');
    }

    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: { trip: true },
    });

    if (!alert) {
      throw new NotFoundException('Alerta não encontrado');
    }

    if (alert.isResolved) {
      throw new BadRequestException('Alerta já resolvido');
    }

    const manualDecisionEligibleStatuses = new Set(['PENDENTE_VALIDACAO', 'SEM_SAIDA', 'INCONSISTENTE']);

    if (!alert.tripId || !alert.trip || !manualDecisionEligibleStatuses.has(alert.trip.currentStatus)) {
      throw new BadRequestException('Este alerta não está apto para decisão manual');
    }

    const status = decision === 'ACEITAR' ? 'CONCLUIDO_ATENCAO' : 'CANCELADO';
    const severity = decision === 'ACEITAR' ? 'MEDIA' : 'BAIXA';
    const notePrefix = `[VALIDACAO_MANUAL:${decision}]`;
    const noteEntry = `${notePrefix} por ${userId} em ${new Date().toISOString()} - ${normalizedJustification}`;

    const [updatedTrip, updatedAlert] = await this.prisma.$transaction([
      this.prisma.trip.update({
        where: { id: alert.tripId },
        data: {
          currentStatus: status,
          severity,
          conclusionType: decision === 'ACEITAR' ? 'Validado manualmente: aceito' : 'Validado manualmente: negado',
          notes: alert.trip.notes ? `${alert.trip.notes}\n${noteEntry}` : noteEntry,
        },
      }),
      this.prisma.alert.update({
        where: { id },
        data: {
          isResolved: true,
          resolvedByUserId: userId,
          resolvedAt: new Date(),
          message: `${alert.message} | Decisão: ${decision} | Justificativa: ${normalizedJustification}`,
        },
      }),
    ]);

    return {
      alert: updatedAlert,
      trip: updatedTrip,
      decision,
    };
  }
}
