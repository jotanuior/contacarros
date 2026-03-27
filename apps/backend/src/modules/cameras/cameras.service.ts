import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class CamerasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(pagination: PaginationDto = {}) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.prisma.camera.findMany({
        include: { location: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.camera.count(),
    ]);

    return PaginatedResponse.of(data, total, page, limit);
  }

  findByCode(code: string) {
    return this.prisma.camera.findUnique({ where: { code }, include: { location: true } });
  }

  async create(data: {
    name: string;
    code: string;
    locationId: string;
    externalRef?: string;
    direction?: 'ENTRADA' | 'SAIDA' | 'INTERNO' | 'EXTERNO';
    active?: boolean;
  }, actorId?: string) {
    const created = await this.prisma.camera.create({ data });
    await this.auditLogs.create({
      userId: actorId,
      action: 'CAMERA_CREATE',
      entityType: 'Camera',
      entityId: created.id,
      description: `Câmera ${created.code} criada`,
      afterData: created,
    });
    return created;
  }

  async update(id: string, data: Partial<{ name: string; code: string; locationId: string; externalRef?: string; direction?: 'ENTRADA' | 'SAIDA' | 'INTERNO' | 'EXTERNO'; active?: boolean }>, actorId?: string) {
    const before = await this.prisma.camera.findUnique({ where: { id } });
    const updated = await this.prisma.camera.update({ where: { id }, data });
    await this.auditLogs.create({
      userId: actorId,
      action: 'CAMERA_UPDATE',
      entityType: 'Camera',
      entityId: updated.id,
      description: `Câmera ${updated.code} atualizada`,
      beforeData: before,
      afterData: updated,
    });
    return updated;
  }

  async remove(id: string, actorId?: string) {
    const before = await this.prisma.camera.findUnique({ where: { id } });
    const updated = await this.prisma.camera.update({ where: { id }, data: { active: false } });

    await this.auditLogs.create({
      userId: actorId,
      action: 'CAMERA_DELETE',
      entityType: 'Camera',
      entityId: id,
      description: `Câmera ${updated.code} desativada`,
      beforeData: before,
      afterData: updated,
    });

    return updated;
  }
}
