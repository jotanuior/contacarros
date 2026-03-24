import { Module } from '@nestjs/common';
import { HeavyChecksService } from './heavy-checks.service';
import { HeavyChecksController } from './heavy-checks.controller';

@Module({
  providers: [HeavyChecksService],
  controllers: [HeavyChecksController],
  exports: [HeavyChecksService],
})
export class HeavyChecksModule {}
