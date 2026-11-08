import { Module } from '@nestjs/common';
import { ServicoModule } from '../servico/servico.module';
import { ProdutoModule } from '../produto/produto.module';
import { ExecucaoController } from './infrastructure/execucao.controller';
import { DynamoDbExecucaoRepository } from './infrastructure/dynamodb-execucao.repository';
import { OsServiceClient } from './infrastructure/os-service/os-service.client';
import { EXECUCAO_REPOSITORY } from './domain/execucao.repository';
import { OS_SERVICE_GATEWAY } from './application/ports/os-service.gateway';
import { EnfileirarExecucaoUseCase } from './application/use-cases/enfileirar-execucao.use-case';
import { AtribuirMecanicoUseCase } from './application/use-cases/atribuir-mecanico.use-case';
import { VincularServicosUseCase } from './application/use-cases/vincular-servicos.use-case';
import { RemoverServicoDaExecucaoUseCase } from './application/use-cases/remover-servico-da-execucao.use-case';
import { VincularProdutosUseCase } from './application/use-cases/vincular-produtos.use-case';
import { ConcluirDiagnosticoUseCase } from './application/use-cases/concluir-diagnostico.use-case';
import { IniciarExecucaoUseCase } from './application/use-cases/iniciar-execucao.use-case';
import { FinalizarExecucaoUseCase } from './application/use-cases/finalizar-execucao.use-case';
import { LiberarExecucaoUseCase } from './application/use-cases/liberar-execucao.use-case';
import { BuscarExecucaoUseCase } from './application/use-cases/buscar-execucao.use-case';
import { ListarExecucoesUseCase } from './application/use-cases/listar-execucoes.use-case';

/** `ClienteHttpInterno` vem do `HttpInternoModule` global (AppModule). */
@Module({
  imports: [ServicoModule, ProdutoModule],
  controllers: [ExecucaoController],
  providers: [
    EnfileirarExecucaoUseCase,
    AtribuirMecanicoUseCase,
    VincularServicosUseCase,
    RemoverServicoDaExecucaoUseCase,
    VincularProdutosUseCase,
    ConcluirDiagnosticoUseCase,
    IniciarExecucaoUseCase,
    FinalizarExecucaoUseCase,
    LiberarExecucaoUseCase,
    BuscarExecucaoUseCase,
    ListarExecucoesUseCase,
    DynamoDbExecucaoRepository,
    { provide: EXECUCAO_REPOSITORY, useExisting: DynamoDbExecucaoRepository },
    OsServiceClient,
    { provide: OS_SERVICE_GATEWAY, useExisting: OsServiceClient },
  ],
})
export class ExecucaoModule {}
