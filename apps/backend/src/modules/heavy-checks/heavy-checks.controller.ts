import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { HeavyChecksService } from './heavy-checks.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import type { JwtUser } from '../../common/current-user.decorator';

@Controller('heavy-checks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OPERADOR', 'AUDITOR')
export class HeavyChecksController {
  constructor(private readonly heavyChecksService: HeavyChecksService) {}

  @Get('pending')
  pending() {
    return this.heavyChecksService.pending();
  }

  @Get('history')
  history() {
    return this.heavyChecksService.history();
  }

  @Post()
  check(
    @Body() body: { tripId?: string; readingId?: string; vehicleId: string; subtype: string; notes?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.heavyChecksService.check({
      ...body,
      checkedByUserId: user.sub,
    });
  }
}
