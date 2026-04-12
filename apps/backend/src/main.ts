import { NestFactory } from '@nestjs/core';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  getAccessCookieName,
  getCsrfCookieName,
  getRefreshCookieName,
  readCookie,
} from './modules/auth/cookies';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Define o prefixo global da API (ex: /api)
  const basePath = process.env.APP_BASE_PATH || '/api';
  app.setGlobalPrefix(basePath.replace(/^\/+/, ''));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // swagger-ui needs inline scripts
          styleSrc: ["'self'", "'unsafe-inline'"], // swagger-ui needs inline styles
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow CORS for assets
      crossOriginOpenerPolicy: false, // Avoid breaking CORS
      hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true, // X-Content-Type-Options: nosniff
      xssFilter: true, // X-XSS-Protection header
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Custom security headers
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
  });

  app.use((request: Request, _response: Response, next: NextFunction) => {
    const method = request.method.toUpperCase();
    const isMutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (!isMutatingMethod) {
      next();
      return;
    }

    const cookieHeader = request.headers.cookie;
    const hasSessionCookie =
      !!readCookie(cookieHeader, getAccessCookieName()) ||
      !!readCookie(cookieHeader, getRefreshCookieName());

    if (!hasSessionCookie) {
      next();
      return;
    }

    const csrfCookie = readCookie(cookieHeader, getCsrfCookieName());
    const csrfHeader = request.headers['x-csrf-token'];
    const headerValue = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;

    if (!csrfCookie || !headerValue || csrfCookie !== headerValue) {
      next(new ForbiddenException('CSRF token inválido ou ausente'));
      return;
    }

    next();
  });

  const config = new DocumentBuilder()
    .setTitle('ContaCarros API')
    .setDescription('API de monitoramento de veículos por LPR')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
