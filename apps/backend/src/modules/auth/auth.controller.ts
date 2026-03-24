import { Body, Controller, Get, Headers, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto';
import { CurrentUser } from '../../common/current-user.decorator';
import type { JwtUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import type { Request, Response } from 'express';
import {
  getAccessCookieName,
  getAccessCookieOptions,
  getCsrfCookieName,
  getCsrfCookieOptions,
  getRefreshCookieName,
  getRefreshCookieOptions,
  readCookie,
} from './cookies';
import * as crypto from 'crypto';

function issueCsrfCookie(response: Response) {
  response.cookie(
    getCsrfCookieName(),
    crypto.randomBytes(24).toString('hex'),
    getCsrfCookieOptions(),
  );
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, ip, userAgent).then((result) => {
      response.cookie(getAccessCookieName(), result.accessToken, getAccessCookieOptions());
      response.cookie(getRefreshCookieName(), result.refreshToken, getRefreshCookieOptions());
      issueCsrfCookie(response);

      return {
        user: result.user,
      };
    });
  }

  @Post('refresh')
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = readCookie(request.headers.cookie, getRefreshCookieName());

    return this.authService.refresh(refreshToken).then((result) => {
      response.cookie(getAccessCookieName(), result.accessToken, getAccessCookieOptions());
      response.cookie(getRefreshCookieName(), result.refreshToken, getRefreshCookieOptions());
      issueCsrfCookie(response);

      return {
        success: true,
        user: result.user,
      };
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtUser, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    if (!readCookie(request.headers.cookie, getCsrfCookieName())) {
      issueCsrfCookie(response);
    }

    return this.authService.me(user.sub);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = readCookie(request.headers.cookie, getRefreshCookieName());
    response.clearCookie(getAccessCookieName(), getAccessCookieOptions());
    response.clearCookie(getRefreshCookieName(), getRefreshCookieOptions());
    response.clearCookie(getCsrfCookieName(), getCsrfCookieOptions());

    return this.authService.logout(user.sub, refreshToken);
  }
}