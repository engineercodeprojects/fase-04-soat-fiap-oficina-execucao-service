// Tracing precisa ser inicializado antes de qualquer outro import (US-F3-10).
import { iniciarTracing } from '@guilhermeqmaia/oficina-kit/metrics';
import { SERVICE_NAME } from './config/service-name';
iniciarTracing({ service: SERVICE_NAME });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('oficina-execucao-service')
      .setDescription(
        'Execucao de OS: atribuicao de mecanico, diagnostico, catalogo de servicos/produtos e estoque (DynamoDB)',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3002);
}
void bootstrap();
