import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PaginatedResponse, PaginationDto } from '../../common/pagination.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private getVehicleInfo(data: any) {
    if (data?.informacoes_veiculo && typeof data.informacoes_veiculo === 'object') {
      return data.informacoes_veiculo;
    }

    return data;
  }

  async list(params: { plate?: string; categoryType?: string; isGratuidade?: boolean } = {}, pagination: PaginationDto = {}) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const where = {
      plate: params.plate ? { contains: params.plate, mode: 'insensitive' as const } : undefined,
      categoryType: params.categoryType as any,
      isGratuidade: params.isGratuidade !== undefined ? params.isGratuidade : undefined,
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
    const info = this.getVehicleInfo(data);

    return this.prisma.vehicle.upsert({
      where: { plate },
      update: {
        brand: info?.marca || info?.brand,
        model: info?.modelo || info?.model,
        year: info?.ano_modelo ? `${info.ano_modelo}` : info?.ano ? `${info.ano}` : undefined,
        segment: info?.segmento,
        subSegment: info?.sub_segmento,
        fuel: info?.combustivel,
        city: info?.municipio,
        state: info?.uf,
        categoryType: categoryType as any,
        lastApiSyncAt: new Date(),
        apiRawData: data,
      },
      create: {
        plate,
        brand: info?.marca || info?.brand,
        model: info?.modelo || info?.model,
        year: info?.ano_modelo ? `${info.ano_modelo}` : info?.ano ? `${info.ano}` : undefined,
        segment: info?.segmento,
        subSegment: info?.sub_segmento,
        fuel: info?.combustivel,
        city: info?.municipio,
        state: info?.uf,
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

  async categorize(plate: string, categoryType: 'CARRO' | 'CAMINHAO' | 'ONIBUS' | 'OUTRO', subSegment?: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { plate } });
    if (!vehicle) {
      throw new Error(`Veículo não encontrado: ${plate}`);
    }
    const shouldClearSubSegment = categoryType === 'CARRO' || categoryType === 'OUTRO';
    return this.prisma.vehicle.update({
      where: { plate },
      data: {
        categoryType: categoryType as import('@prisma/client').VehicleCategoryType,
        subSegment: shouldClearSubSegment ? null : (subSegment ?? vehicle.subSegment),
      },
    });
  }

  async applyCameraTypeMapping(
    plate: string,
    mapping: { categoryType: 'CARRO' | 'CAMINHAO' | 'ONIBUS'; subtype?: string | null },
  ) {
    return this.prisma.vehicle.upsert({
      where: { plate },
      update: {
        categoryType: mapping.categoryType,
        segment: mapping.categoryType === 'CARRO' ? undefined : mapping.categoryType,
        subSegment: mapping.categoryType === 'CARRO' ? null : mapping.subtype ?? null,
      },
      create: {
        plate,
        categoryType: mapping.categoryType,
        segment: mapping.categoryType === 'CARRO' ? undefined : mapping.categoryType,
        subSegment: mapping.categoryType === 'CARRO' ? null : mapping.subtype ?? null,
      },
    });
  }

  async setGratuidade(plate: string, isGratuidade: boolean, gratuidadeType?: string | null) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { plate } });
    if (!vehicle) {
      throw new BadRequestException(`Veículo não encontrado: ${plate}`);
    }
    return this.prisma.vehicle.update({
      where: { plate },
      data: {
        isGratuidade,
        gratuidadeType: isGratuidade ? (gratuidadeType?.trim() || null) : null,
      },
    });
  }

  async correct(
    plate: string,
    userId: string,
    data: { newPlate?: string; categoryType?: string; subSegment?: string; justification: string },
  ) {
    if (!data.justification?.trim()) {
      throw new BadRequestException('Justificativa é obrigatória para correção de veículo');
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { plate } });
    if (!vehicle) {
      throw new BadRequestException(`Veículo não encontrado: ${plate}`);
    }

    const updateData: Record<string, unknown> = {};
    let normalizedNewPlate: string | undefined;
    if (data.newPlate && data.newPlate.trim() !== plate) {
      normalizedNewPlate = data.newPlate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      updateData.plate = normalizedNewPlate;
    }
    if (data.categoryType) {
      updateData.categoryType = data.categoryType;
      // Clear subSegment when switching to a type that doesn't use it
      if ((data.categoryType === 'CARRO' || data.categoryType === 'OUTRO') && data.subSegment === undefined) {
        updateData.subSegment = null;
      }
    }
    if (data.subSegment !== undefined) {
      updateData.subSegment = data.subSegment || null;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Nenhum campo de correção informado');
    }

    let updated = vehicle;

    if (normalizedNewPlate) {
      const targetVehicle = await this.prisma.vehicle.findUnique({ where: { plate: normalizedNewPlate } });

      // If target plate already exists, merge all references from source plate into target.
      if (targetVehicle && targetVehicle.id !== vehicle.id) {
        updated = await this.prisma.$transaction(async (tx) => {
          await tx.reading.updateMany({
            where: {
              OR: [
                { vehicleId: vehicle.id },
                { normalizedPlate: plate },
              ],
            },
            data: {
              vehicleId: targetVehicle.id,
              normalizedPlate: normalizedNewPlate,
              plate: normalizedNewPlate,
            },
          });

          await tx.trip.updateMany({
            where: {
              OR: [
                { vehicleId: vehicle.id },
                { plate },
              ],
            },
            data: {
              vehicleId: targetVehicle.id,
              plate: normalizedNewPlate,
            },
          });

          await tx.alert.updateMany({
            where: { plate },
            data: { plate: normalizedNewPlate },
          });

          await tx.heavyVehicleCheck.updateMany({
            where: { vehicleId: vehicle.id },
            data: { vehicleId: targetVehicle.id },
          });

          const targetUpdateData: Record<string, unknown> = {};
          if (data.categoryType) {
            targetUpdateData.categoryType = data.categoryType;
            if ((data.categoryType === 'CARRO' || data.categoryType === 'OUTRO') && data.subSegment === undefined) {
              targetUpdateData.subSegment = null;
            }
          }
          if (data.subSegment !== undefined) {
            targetUpdateData.subSegment = data.subSegment || null;
          }

          if (Object.keys(targetUpdateData).length > 0) {
            await tx.vehicle.update({
              where: { id: targetVehicle.id },
              data: targetUpdateData as import('@prisma/client').Prisma.VehicleUpdateInput,
            });
          }

          await tx.vehicle.delete({ where: { id: vehicle.id } });

          return tx.vehicle.findUniqueOrThrow({ where: { id: targetVehicle.id } });
        });
      } else {
        updated = await this.prisma.$transaction(async (tx) => {
          const vehicleUpdated = await tx.vehicle.update({
            where: { plate },
            data: updateData as import('@prisma/client').Prisma.VehicleUpdateInput,
          });

          await tx.reading.updateMany({
            where: { normalizedPlate: plate },
            data: { normalizedPlate: normalizedNewPlate, plate: normalizedNewPlate },
          });

          await tx.trip.updateMany({
            where: { plate },
            data: { plate: normalizedNewPlate },
          });

          await tx.alert.updateMany({
            where: { plate },
            data: { plate: normalizedNewPlate },
          });

          return vehicleUpdated;
        });
      }
    } else {
      updated = await this.prisma.vehicle.update({
        where: { plate },
        data: updateData as import('@prisma/client').Prisma.VehicleUpdateInput,
      });
    }

    await this.auditLogs.create({
      userId,
      action: 'VEHICLE_CORRECTED',
      entityType: 'Vehicle',
      entityId: vehicle.id,
      description: `Correção manual: ${data.justification.trim()}`,
      beforeData: { plate: vehicle.plate, categoryType: vehicle.categoryType, subSegment: vehicle.subSegment },
      afterData: { plate: updated.plate, categoryType: updated.categoryType, subSegment: updated.subSegment },
    });

    return updated;
  }
}
