import { Module } from '@nestjs/common';
import { RouteRulesService } from './route-rules.service';
import { RouteRulesController } from './route-rules.controller';

@Module({
  providers: [RouteRulesService],
  controllers: [RouteRulesController],
  exports: [RouteRulesService],
})
export class RouteRulesModule {}
