import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CamerasService } from '../cameras/cameras.service';
import { ReadingsService } from './readings.service';
import { IntelbrasAdapterService } from './intelbras-adapter.service';

@Controller()
export class IntelbrasController {
  constructor(
    private readonly readingsService: ReadingsService,
    private readonly camerasService: CamerasService,
    private readonly intelbrasAdapterService: IntelbrasAdapterService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post([
    'integrations/intelbras/report/:cameraRef',
    'integrations/intelbras/report',
    'ReportHttpUpload/:cameraRef',
    'ReportHttpUpload',
  ])
  async receiveReport(
    @Body() body: unknown,
    @Param('cameraRef') cameraRef?: string,
  ) {
    const cameraCode = await this.resolveCameraCode(cameraRef, body, true);
    if (!cameraCode) {
      throw new BadRequestException('Não foi possível resolver a câmera Intelbras para a leitura recebida.');
    }

    const dto = this.intelbrasAdapterService.toReadingDto(body, cameraCode);
    const reading = await this.readingsService.ingest(dto);

    return {
      ok: true,
      cameraCode,
      plate: reading?.normalizedPlate ?? dto.plate,
      readingId: reading?.id ?? null,
      receivedAt: new Date().toISOString(),
    };
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
    @Param('cameraRef') cameraRef?: string,
  ) {
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
