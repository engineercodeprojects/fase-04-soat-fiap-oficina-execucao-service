import { Module } from '@nestjs/common';
import { ProdutoController } from './infrastructure/produto.controller';
import { DynamoDbProdutoRepository } from './infrastructure/dynamodb-produto.repository';
import { DynamoDbEstoqueRepository } from './infrastructure/dynamodb-estoque.repository';
import { ESTOQUE_REPOSITORY, PRODUTO_REPOSITORY } from './domain/produto.repository';
import { CriarProdutoUseCase } from './application/use-cases/criar-produto.use-case';
import { ListarProdutosUseCase } from './application/use-cases/listar-produtos.use-case';
import { BuscarProdutoUseCase } from './application/use-cases/buscar-produto.use-case';
import { AtualizarProdutoUseCase } from './application/use-cases/atualizar-produto.use-case';
import { RemoverProdutoUseCase } from './application/use-cases/remover-produto.use-case';
import { RegistrarEntradaEstoqueUseCase } from './application/use-cases/registrar-entrada-estoque.use-case';
import { ListarMovimentacoesUseCase } from './application/use-cases/listar-movimentacoes.use-case';
import { EstoqueService } from './application/services/estoque.service';

@Module({
  controllers: [ProdutoController],
  providers: [
    CriarProdutoUseCase,
    ListarProdutosUseCase,
    BuscarProdutoUseCase,
    AtualizarProdutoUseCase,
    RemoverProdutoUseCase,
    RegistrarEntradaEstoqueUseCase,
    ListarMovimentacoesUseCase,
    EstoqueService,
    DynamoDbProdutoRepository,
    DynamoDbEstoqueRepository,
    { provide: PRODUTO_REPOSITORY, useExisting: DynamoDbProdutoRepository },
    { provide: ESTOQUE_REPOSITORY, useExisting: DynamoDbEstoqueRepository },
  ],
  exports: [EstoqueService, PRODUTO_REPOSITORY, ListarMovimentacoesUseCase],
})
export class ProdutoModule {}
