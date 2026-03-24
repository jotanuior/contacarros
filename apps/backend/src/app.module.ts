import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LocationsModule } from './modules/locations/locations.module';
import { CamerasModule } from './modules/cameras/cameras.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { RouteRulesModule } from './modules/route-rules/route-rules.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { HeavyChecksModule } from './modules/heavy-checks/heavy-checks.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TripsModule } from './modules/trips/trips.module';
import { ReadingsModule } from './modules/readings/readings.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 900000, // 15 minutes in milliseconds
        limit: 5, // max 5 requests per ttl
      },
    ]),
    PrismaModule,
    AuditLogsModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    CamerasModule,
    IntegrationsModule,
    VehiclesModule,
    RouteRulesModule,
    AlertsModule,
    TripsModule,
    ReadingsModule,
    HeavyChecksModule,
    DashboardModule,
    ReportsModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
