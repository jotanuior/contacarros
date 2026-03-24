import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(pagination: PaginationDto = {}) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.location.findMany({
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.location.count(),
    ]);

    return PaginatedResponse.of(data, total, page, limit);
  }

  async create(data: { name: string; code: string; description?: string; active?: boolean }, actorId?: string) {
    const created = await this.prisma.location.create({ data });
    await this.auditLogs.create({
      userId: actorId,
      action: 'LOCATION_CREATE',
      entityType: 'Location',
      entityId: created.id,
      description: `Local ${created.code} criado`,
      afterData: created,
    });
    return created;
  }

  async update(id: string, data: { name?: string; code?: string; description?: string; active?: boolean }, actorId?: string) {
    const before = await this.prisma.location.findUnique({ where: { id } });
    const updated = await this.prisma.location.update({ where: { id }, data });
    await this.auditLogs.create({
      userId: actorId,
      action: 'LOCATION_UPDATE',
      entityType: 'Location',
      entityId: id,
      description: `Local ${updated.code} atualizado`,
      beforeData: before,
      afterData: updated,
    });
    return updated;
  }
}
