import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global Prefix
  app.setGlobalPrefix('api');

  // Cookie Parser
  app.use(cookieParser());

  // CORS Configuration
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('NextERP & Inventory Core API')
    .setDescription(
      'Dokumentasi API RESTful untuk NextERP & Inventory Management System. ' +
        'Autentikasi memakai cookie HttpOnly (access_token): login lewat POST /api/auth/login ' +
        'lalu klik Authorize untuk menyimpan cookie di sesi docs ini.',
    )
    .setVersion('1.0')
    .addCookieAuth('access_token', undefined, 'access_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 NextERP Backend running on: http://localhost:${port}/api`);
  console.log(`📚 Swagger UI available at: http://localhost:${port}/api/docs`);
}

bootstrap();
