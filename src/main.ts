import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { GlobalResponseInterceptor } from './common/interceptors/global-response.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Startup Validation
  const requiredEnvs = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
    'MEDIA_BASE_URL',
    'MEDIA_STORAGE_PROVIDER',
  ];
  const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);

  if (missingEnvs.length > 0) {
    logger.error(
      `Faltam variáveis de ambiente obrigatórias: ${missingEnvs.join(', ')}`,
    );
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Production Hardening Checks
  if (isProduction) {
    const insecureSecrets = ['secret', 'default-secret', 'change-me', '123456'];
    if (insecureSecrets.includes(process.env.JWT_SECRET || '')) {
      logger.error('FATAL: JWT_SECRET fraco ou default detectado em produção!');
      process.exit(1);
    }
    if (insecureSecrets.includes(process.env.JWT_REFRESH_SECRET || '') || process.env.JWT_REFRESH_SECRET === 'refresh_secret') {
      logger.error('FATAL: JWT_REFRESH_SECRET fraco ou default detectado em produção!');
      process.exit(1);
    }
    if (process.env.BILLING_MOCK_PAYMENTS_ENABLED === 'true') {
      logger.error('FATAL: BILLING_MOCK_PAYMENTS_ENABLED não pode estar true em produção!');
      process.exit(1);
    }
    if (!process.env.CORS_ORIGINS || process.env.CORS_ORIGINS === '*') {
      logger.error('FATAL: CORS_ORIGINS explícito (não-wildcard) é obrigatório em produção!');
      process.exit(1);
    }
  }

  const app = await NestFactory.create(AppModule);

  // Security Headers
  app.use(helmet());

  // CORS
  let corsOrigins: string[] | string = '*';
  if (isProduction) {
    corsOrigins = process.env.CORS_ORIGINS!.split(',');
  } else {
    corsOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:5173'];
  }

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global Pipes, Filters and Interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new GlobalResponseInterceptor());

  // Swagger - Disabled by default in production unless explicitly enabled
  const enableSwagger = isProduction
    ? process.env.SWAGGER_ENABLED === 'true'
    : process.env.SWAGGER_ENABLED !== 'false';

  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('AppRoteiros API')
      .setDescription('The AppRoteiros API description')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application listening on port ${port} (env: ${process.env.NODE_ENV || 'development'})`);
}
bootstrap();
