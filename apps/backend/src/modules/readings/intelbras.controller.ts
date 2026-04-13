/**
 * IntelbrasController — endpoint bruto compatível com câmeras Intelbras LPR/ANPR
 *
 * Princípio: a câmera recebe SEMPRE HTTP 200 + text/plain "OK", independente de
 * qualquer validação de negócio. Todo o processamento acontece de forma assíncrona
 * após a resposta ser enviada (ver IntelbrasRawService).
 */
import { All, Controller, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IntelbrasRawService } from './intelbras-raw.service';

@Controller()
export class IntelbrasController {
  constructor(private readonly rawService: IntelbrasRawService) {}

  /**
   * Heartbeat / KeepAlive — câmera envia periodicamente para verificar conectividade.
   * Aceita qualquer método HTTP (GET, POST, PUT…).
   * cameraRef é opcional na rota: /NotificationInfo/KeepAlive/<código>
   */
  @All([
    'NotificationInfo/KeepAlive',
    'NotificationInfo/KeepAlive/:cameraRef',
    'integrations/intelbras/keepalive',
    'integrations/intelbras/keepalive/:cameraRef',
    'intelbras/keepalive',
    'intelbras/keepalive/:cameraRef',
  ])
  keepAlive(
    @Param('cameraRef') cameraRef: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const capture = this.rawService.capture(req, cameraRef);
    this.rawService.logAndProcess('KEEPALIVE', capture);
    res.status(200).type('text/plain').send('OK');
  }

  /**
   * Upload de leitura LPR (placa capturada).
   * Aceita qualquer método HTTP e qualquer Content-Type.
   * cameraRef é opcional na rota: /ReportHttpUpload/<código>
   *
   * O processamento de negócio (resolução da câmera, persistência da leitura,
   * deduplicação, alertas) ocorre assincronamente via setImmediate no
   * IntelbrasRawService, sem bloquear a resposta para a câmera.
   *
   * Upgrade para fila BullMQ:
   *   No IntelbrasRawService, substitua setImmediate por:
   *     await this.queue.add('process-report', capture)
   *   e implemente um @Processor('intelbras') separado.
   */
  @All([
    'ReportHttpUpload',
    'ReportHttpUpload/:cameraRef',
    'integrations/intelbras/report',
    'integrations/intelbras/report/:cameraRef',
    'intelbras/anpr',
    'intelbras/anpr/:cameraRef',
  ])
  report(
    @Param('cameraRef') cameraRef: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const capture = this.rawService.capture(req, cameraRef);
    this.rawService.logAndProcess('REPORT', capture);
    res.status(200).type('text/plain').send('OK');
  }

  /**
   * Catch-all para outros paths NotificationInfo (ex: /NotificationInfo/ANPR).
   * Tratado como REPORT — tenta processar a leitura assincronamente.
   */
  @All(['NotificationInfo/:kind', 'NotificationInfo/:kind/:cameraRef'])
  notificationInfo(
    @Param('cameraRef') cameraRef: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const capture = this.rawService.capture(req, cameraRef);
    // kind já está no capture.path; trata tudo como potential REPORT
    this.rawService.logAndProcess('REPORT', capture);
    res.status(200).type('text/plain').send('OK');
  }
}
