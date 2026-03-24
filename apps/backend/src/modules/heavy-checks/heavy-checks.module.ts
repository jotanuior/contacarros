import { Module } from '@nestjs/common';
import { HeavyChecksService } from './heavy-checks.service';
import { HeavyChecksController } from './heavy-checks.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [HeavyChecksService],
  controllers: [HeavyChecksController],
  exports: [HeavyChecksService],
})
export class HeavyChecksModule {}
