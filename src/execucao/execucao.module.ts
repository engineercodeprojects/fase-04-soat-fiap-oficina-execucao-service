import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EmissorTokenServico } from '@guilhermeqmaia/oficina-kit/http';
import { SERVICE_NAME } from '../config/service-name';
import { ServicoModule } from '../servico/servico.module';
import { ProdutoModule } from '../produto/produto.module';
import { ExecucaoController } from './infrastructure/execucao.controller';
import { DynamoDbExecucaoRepository } from './infrastructure/dynamodb-execucao.repository';
import {
  EMISSOR_TOKEN_SERVICO,
  OS_SERVICE_HTTP,
  OsServiceClient,
} from './infrastructure/os-service/os-service.client';
import {
  OS_SERVICE_CONFIG,
  resolverOsServiceConfig,
} from './infrastructure/os-service/os-service.config';
import { EXECUCAO_REPOSITORY } from './domain/execucao.repository';
import { OS_SERVICE_GATEWAY } from './application/ports/os-service.gateway';
import { AtribuirMecanicoUseCase } from './application/use-cases/atribuir-mecanico.use-case';
import { AtualizarStatusExecucaoUseCase } from './application/use-cases/atualizar-status-execucao.use-case';
import { VincularServicosUseCase } from './application/use-cases/vincular-servicos.use-case';
import { RemoverServicoDaExecucaoUseCase } from './application/use-cases/remover-servico-da-execucao.use-case';
import { VincularProdutosUseCase } from './application/use-cases/vincular-produtos.use-case';
import { FecharDiagnosticoUseCase } from './application/use-cases/fechar-diagnostico.use-case';
import { RollbackExecucaoUseCase } from './application/use-cases/rollback-execucao.use-case';
import { BuscarExecucaoUseCase } from './application/use-cases/buscar-execucao.use-case';
import { ListarExecucoesUseCase } from './application/use-cases/listar-execucoes.use-case';

@Module({
  imports: [ServicoModule, ProdutoModule],
  controllers: [ExecucaoController],
  providers: [
    AtribuirMecanicoUseCase,
    AtualizarStatusExecucaoUseCase,
    VincularServicosUseCase,
    RemoverServicoDaExecucaoUseCase,
    VincularProdutosUseCase,
    FecharDiagnosticoUseCase,
    RollbackExecucaoUseCase,
    BuscarExecucaoUseCase,
    ListarExecucoesUseCase,
    DynamoDbExecucaoRepository,
    { provide: EXECUCAO_REPOSITORY, useExisting: DynamoDbExecucaoRepository },
    { provide: OS_SERVICE_CONFIG, useFactory: () => resolverOsServiceConfig(process.env) },
    {
      provide: EMISSOR_TOKEN_SERVICO,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        new EmissorTokenServico(SERVICE_NAME.replace(/^oficina-/, ''), {
          secret: c.getOrThrow<string>('JWT_SECRET'),
          issuer: c.get<string>('JWT_ISSUER'),
        }),
    },
    { provide: OS_SERVICE_HTTP, useFactory: () => axios.create() },
    OsServiceClient,
    { provide: OS_SERVICE_GATEWAY, useExisting: OsServiceClient },
  ],
})
export class ExecucaoModule {}
