import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateOpenApi() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_for_openapi';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_for_openapi';

  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('2GO / AppRoteiros API')
    .setDescription('API de Roteiros de Viagem com IA e Autenticação OTP')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outputPath = path.join(process.cwd(), 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');

  console.log(`OpenAPI specification exported successfully to ${outputPath}`);
  await app.close();
}

generateOpenApi().catch((err) => {
  console.error('Error generating OpenAPI spec:', err);
  process.exit(1);
});
