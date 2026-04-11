import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Logger, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CamerasService } from '../cameras/cameras.service';
import { ReadingsService } from './readings.service';
import { IntelbrasAdapterService } from './intelbras-adapter.service';

@Controller()
export class IntelbrasController {
  private readonly logger = new Logger(IntelbrasController.name);

  constructor(
    private readonly readingsService: ReadingsService,
    private readonly camerasService: CamerasService,
    private readonly intelbrasAdapterService: IntelbrasAdapterService,
  ) {}

  private safeSerialize(payload: unknown) {
    try {
      const serialized = JSON.stringify(payload);
      if (!serialized) {
        return '';
      }

      return serialized.length > 4000 ? `${serialized.slice(0, 4000)}...[truncated]` : serialized;
    } catch {
      return '[unserializable payload]';
    }
  }

  private logIntelbrasRequest(
    type: string,
    request: Request,
    body: unknown,
    extra: Record<string, unknown> = {},
  ) {
    this.logger.log(
      `[Intelbras ${type}] ip=${request.headers['x-forwarded-for'] || request.ip || request.socket.remoteAddress || '-'} ` +
      `userAgent=${request.headers['user-agent'] || '-'} contentType=${request.headers['content-type'] || '-'} ` +
      `route=${request.originalUrl || request.url} meta=${this.safeSerialize(extra)} body=${this.safeSerialize(body)}`,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post([
    'integrations/intelbras/report/:cameraRef',
    'integrations/intelbras/report',
    'ReportHttpUpload/:cameraRef',
    'ReportHttpUpload',
  ])
  async receiveReport(
    @Body() body: unknown,
    @Param('cameraRef') cameraRef: string | undefined,
    @Req() request: Request,
  ) {
    this.logIntelbrasRequest('REPORT', request, body, { cameraRef });

    try {
      const cameraCode = await this.resolveCameraCode(cameraRef, body, true);
      if (!cameraCode) {
        throw new BadRequestException('Não foi possível resolver a câmera Intelbras para a leitura recebida.');
      }

      const dto = this.intelbrasAdapterService.toReadingDto(body, cameraCode);
      const reading = await this.readingsService.ingest(dto);

      return {
        ok: true,
        accepted: true,
        cameraCode,
        plate: reading?.normalizedPlate ?? dto.plate,
        readingId: reading?.id ?? null,
        receivedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`Falha ao processar ReportHttpUpload em modo debug: ${message}`);

      return {
        ok: true,
        accepted: false,
        debug: true,
        reason: message,
        cameraCode: cameraRef ?? this.intelbrasAdapterService.extractCameraRef(body) ?? null,
        receivedAt: new Date().toISOString(),
      };
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post([
    'integrations/intelbras/keepalive/:cameraRef',
    'integrations/intelbras/keepalive',
    'NotificationInfo/KeepAlive/:cameraRef',
    'NotificationInfo/KeepAlive',
  ])
  async receiveKeepAlive(
    @Body() body: unknown,
    @Param('cameraRef') cameraRef: string | undefined,
    @Req() request: Request,
  ) {
    this.logIntelbrasRequest('KEEPALIVE', request, body, { cameraRef });
    const resolvedCamera = await this.resolveCameraCode(cameraRef, body, false);

    return {
      ok: true,
      cameraCode: resolvedCamera ?? null,
      heartbeat: true,
      receivedAt: new Date().toISOString(),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Get([
    'integrations/intelbras/keepalive/:cameraRef',
    'integrations/intelbras/keepalive',
    'NotificationInfo/KeepAlive/:cameraRef',
    'NotificationInfo/KeepAlive',
  ])
  async receiveKeepAliveViaGet(@Param('cameraRef') cameraRef?: string) {
    return {
      ok: true,
      cameraCode: cameraRef ?? null,
      heartbeat: true,
      receivedAt: new Date().toISOString(),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Get(['ReportHttpUpload/:cameraRef', 'ReportHttpUpload'])
  async receiveReportViaGet(
    @Param('cameraRef') cameraRef: string | undefined,
    @Req() request: Request,
  ) {
    this.logIntelbrasRequest('REPORT/GET', request, undefined, { cameraRef });

    return {
      ok: true,
      accepted: false,
      debug: true,
      reason: 'GET recebido em ReportHttpUpload',
      cameraCode: cameraRef ?? null,
      receivedAt: new Date().toISOString(),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post(['NotificationInfo/:kind', 'NotificationInfo/:kind/:cameraRef'])
  async receiveGenericNotificationInfo(
    @Param('kind') kind: string,
    @Body() body: unknown,
    @Param('cameraRef') cameraRef: string | undefined,
    @Req() request: Request,
  ) {
    if (kind.toLowerCase() === 'keepalive') {
      return this.receiveKeepAlive(body, cameraRef, request);
    }

    this.logIntelbrasRequest(`NOTIFICATION/${kind}`, request, body, { cameraRef });

    try {
      const cameraCode = await this.resolveCameraCode(cameraRef, body, false);
      if (cameraCode) {
        const dto = this.intelbrasAdapterService.toReadingDto(body, cameraCode);
        const reading = await this.readingsService.ingest(dto);

        return {
          ok: true,
          notificationKind: kind,
          cameraCode,
          plate: reading?.normalizedPlate ?? dto.plate,
          readingId: reading?.id ?? null,
          receivedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`Falha ao processar NotificationInfo/${kind}: ${message}`);
    }

    return {
      ok: true,
      notificationKind: kind,
      cameraCode: cameraRef ?? null,
      receivedAt: new Date().toISOString(),
    };
  }

  private async resolveCameraCode(
    cameraRef: string | undefined,
    body: unknown,
    required: boolean,
  ): Promise<string | undefined> {
    const candidates = [cameraRef, this.intelbrasAdapterService.extractCameraRef(body)].filter(
      (value): value is string => Boolean(value),
    );

    for (const candidate of candidates) {
      const camera = await this.camerasService.findByCodeOrExternalRef(candidate);
      if (camera) {
        return camera.code;
      }
    }

    if (cameraRef) {
      return cameraRef;
    }

    if (!required) {
      return undefined;
    }

    throw new BadRequestException(
      'Identificador da câmera ausente. Informe o código na rota ou configure o externalRef com o DeviceID da Intelbras.',
    );
  }
}
