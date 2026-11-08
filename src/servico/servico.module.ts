import { Module } from '@nestjs/common';
import { ServicoController } from './infrastructure/servico.controller';
import { DynamoDbServicoRepository } from './infrastructure/dynamodb-servico.repository';
import { SERVICO_REPOSITORY } from './domain/servico.repository';
import { CriarServicoUseCase } from './application/use-cases/criar-servico.use-case';
import { ListarServicosUseCase } from './application/use-cases/listar-servicos.use-case';
import { BuscarServicoUseCase } from './application/use-cases/buscar-servico.use-case';
import { AtualizarServicoUseCase } from './application/use-cases/atualizar-servico.use-case';
import { RemoverServicoUseCase } from './application/use-cases/remover-servico.use-case';

@Module({
  controllers: [ServicoController],
  providers: [
    CriarServicoUseCase,
    ListarServicosUseCase,
    BuscarServicoUseCase,
    AtualizarServicoUseCase,
    RemoverServicoUseCase,
    DynamoDbServicoRepository,
    { provide: SERVICO_REPOSITORY, useExisting: DynamoDbServicoRepository },
  ],
  exports: [SERVICO_REPOSITORY],
})
export class ServicoModule {}
