import { Module } from '@nestjs/common';
import { PlacaFipeService } from './placa-fipe.service';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [SettingsModule, AuditLogsModule],
  providers: [PlacaFipeService],
  exports: [PlacaFipeService],
})
export class IntegrationsModule {}
