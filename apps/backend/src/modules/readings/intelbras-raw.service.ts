/**
 * Por que câmeras Intelbras falham com respostas JSON complexas
 * ─────────────────────────────────────────────────────────────
 * O firmware de câmeras LPR/ANPR Intelbras (e Dahua, base comum) implementa um
 * cliente HTTP simples. Após enviar o payload, ele verifica:
 *   1. HTTP status code — qualquer coisa diferente de 200 marca a entrega como falha.
 *   2. Corpo da resposta — algumas versões esperam exatamente o texto "OK" ou "ok".
 *      Uma resposta JSON grande (ou UTF-8 com chaves desconhecidas) pode causar:
 *      a) Parse error interno → retry storm (a câmera reenvia indefinidamente).
 *      b) Interpretação errônea de `accepted: false` como falha, mesmo com HTTP 200.
 *      c) Truncamento do corpo se exceder o buffer do firmware (~512 bytes).
 * A solução é sempre responder: HTTP 200 + Content-Type: text/plain + body: "OK"
 * e mover toda a lógica de negócio para processamento assíncrono após enviar a resposta.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { CamerasService } from '../cameras/cameras.service';
import { IntelbrasAdapterService } from './intelbras-adapter.service';
import { ReadingsService } from './readings.service';

export interface IntelbrasRawCapture {
  method: string;
  path: string;
  ip: string;
  contentType: string | undefined;
  query: Record<string, unknown>;
  rawBody: string;
  parsedBody: unknown;
  capturedAt: string;
  cameraRef: string | undefined;
}

@Injectable()
export class IntelbrasRawService {
  private readonly logger = new Logger(IntelbrasRawService.name);

  constructor(
    private readonly adapter: IntelbrasAdapterService,
    private readonly readingsService: ReadingsService,
    private readonly camerasService: CamerasService,
  ) {}

  /**
   * Extrai todos os dados brutos da request antes de enviar "OK" ao cliente.
   */
  capture(request: Request, cameraRef?: string): IntelbrasRawCapture {
    const rawBodyBuffer = (request as Request & { rawBody?: Buffer | string }).rawBody;
    const rawBody =
      Buffer.isBuffer(rawBodyBuffer)
        ? rawBodyBuffer.toString('utf8')
        : typeof rawBodyBuffer === 'string'
          ? rawBodyBuffer
          : '';

    let parsedBody: unknown = request.body ?? undefined;
    if (!parsedBody && rawBody) {
      try {
        parsedBody = JSON.parse(rawBody) as unknown;
      } catch {
        parsedBody = rawBody;
      }
    }

    return {
      method: request.method,
      path: request.originalUrl ?? request.url,
      ip:
        (request.headers['x-forwarded-for'] as string | undefined) ??
        request.ip ??
        request.socket?.remoteAddress ??
        '-',
      contentType: request.headers['content-type'],
      query: request.query as Record<string, unknown>,
      rawBody,
      parsedBody,
      capturedAt: new Date().toISOString(),
      cameraRef: cameraRef || undefined,
    };
  }

  /**
   * Loga a captura e, para REPORT, dispara o processamento de negócio de forma
   * assíncrona (fire-and-forget) — a resposta HTTP "OK" já foi enviada antes
   * deste método ser invocado.
   *
   * Para uso em produção com volumes altos, substitua o setImmediate por uma fila
   * BullMQ:
   *   @InjectQueue('intelbras') private queue: Queue
   *   await this.queue.add('process-report', capture)
   * e implemente um @Processor('intelbras') separado.
   */
  logAndProcess(type: 'KEEPALIVE' | 'REPORT', capture: IntelbrasRawCapture): void {
    this.logger.log(
      `[Intelbras ${type}] method=${capture.method} ip=${capture.ip} ` +
        `path=${capture.path} contentType=${capture.contentType ?? '-'} ` +
        `cameraRef=${capture.cameraRef ?? '-'} rawBodyLen=${capture.rawBody.length}`,
    );

    if (capture.rawBody) {
      this.logger.debug(`[Intelbras ${type}] rawBody=${capture.rawBody.slice(0, 2000)}`);
    }

    if (type === 'REPORT') {
      // Fire-and-forget: processa após a resposta HTTP já ter sido enviada
      setImmediate(() => {
        this.processReportAsync(capture).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[Intelbras REPORT] processamento assíncrono falhou: ${msg}`);
        });
      });
    }
  }

  private async processReportAsync(capture: IntelbrasRawCapture): Promise<void> {
    const cameraCode = await this.resolveCameraCode(capture);

    if (!cameraCode) {
      this.logger.warn(
        `[Intelbras REPORT] câmera não identificada — leitura descartada. ` +
          `path=${capture.path} cameraRef=${capture.cameraRef ?? '-'}`,
      );
      return;
    }

    const dto = this.adapter.toReadingDto(capture.parsedBody, cameraCode);
    const reading = await this.readingsService.ingest(dto);

    this.logger.log(
      `[Intelbras REPORT] leitura salva id=${reading?.id} ` +
        `plate=${reading?.normalizedPlate ?? dto.plate} camera=${cameraCode}`,
    );
  }

  private async resolveCameraCode(capture: IntelbrasRawCapture): Promise<string | undefined> {
    const candidates = [
      capture.cameraRef,
      this.adapter.extractCameraRef(capture.parsedBody),
    ].filter((v): v is string => Boolean(v));

    for (const candidate of candidates) {
      const camera = await this.camerasService.findByCodeOrExternalRef(candidate);
      if (camera) {
        return camera.code;
      }
    }

    // Fallback: usa o valor bruto (câmera pode não estar cadastrada ainda)
    return candidates[0];
  }
}
