import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';

type AuditCreateInput = {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  beforeData?: unknown;
  afterData?: unknown;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: AuditCreateInput) {
    return this.prisma.auditLog.create({ data: data as Prisma.AuditLogUncheckedCreateInput });
  }

  async findAll(
    params: { userId?: string; action?: string; entityType?: string; from?: Date; to?: Date },
    pagination: PaginationDto = {},
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const { userId, action, entityType, from, to } = params;
    const where: Prisma.AuditLogWhereInput = {
      userId,
      action,
      entityType,
      createdAt: from || to ? { gte: from, lte: to } : undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return PaginatedResponse.of(data, total, page, limit);
  }
}