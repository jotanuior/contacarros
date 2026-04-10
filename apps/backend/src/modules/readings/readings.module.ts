import { Module } from '@nestjs/common';
import { ReadingsService } from './readings.service';
import { ReadingsController } from './readings.controller';
import { IntelbrasController } from './intelbras.controller';
import { CamerasModule } from '../cameras/cameras.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { TripsModule } from '../trips/trips.module';
import { AlertsModule } from '../alerts/alerts.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { IntelbrasAdapterService } from './intelbras-adapter.service';

@Module({
  imports: [CamerasModule, VehiclesModule, IntegrationsModule, TripsModule, AlertsModule, SettingsModule, AuditLogsModule],
  providers: [ReadingsService, IntelbrasAdapterService],
  controllers: [ReadingsController, IntelbrasController],
  exports: [ReadingsService],
})
export class ReadingsModule {}
