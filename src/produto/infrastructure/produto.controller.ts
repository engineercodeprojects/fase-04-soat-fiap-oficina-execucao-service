import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role, Roles } from '@guilhermeqmaia/oficina-kit/auth';
import { CreateProdutoDto, EntradaEstoqueDto, UpdateProdutoDto } from './dto/produto.dto';
import { ProdutoPresenter } from './presenters/produto.presenter';
import { CriarProdutoUseCase } from '../application/use-cases/criar-produto.use-case';
import { ListarProdutosUseCase } from '../application/use-cases/listar-produtos.use-case';
import { BuscarProdutoUseCase } from '../application/use-cases/buscar-produto.use-case';
import { AtualizarProdutoUseCase } from '../application/use-cases/atualizar-produto.use-case';
import { RemoverProdutoUseCase } from '../application/use-cases/remover-produto.use-case';
import { RegistrarEntradaEstoqueUseCase } from '../application/use-cases/registrar-entrada-estoque.use-case';
import { ListarMovimentacoesUseCase } from '../application/use-cases/listar-movimentacoes.use-case';

@ApiTags('Produtos e estoque')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente ou invalido' })
@ApiForbiddenResponse({ description: 'Role insuficiente' })
@Controller('catalogo/produtos')
export class ProdutoController {
  constructor(
    private readonly criar: CriarProdutoUseCase,
    private readonly listar: ListarProdutosUseCase,
    private readonly buscar: BuscarProdutoUseCase,
    private readonly atualizar: AtualizarProdutoUseCase,
    private readonly remover: RemoverProdutoUseCase,
    private readonly registrarEntrada: RegistrarEntradaEstoqueUseCase,
    private readonly listarMovimentacoes: ListarMovimentacoesUseCase,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.ESTOQUISTA)
  @ApiOperation({ summary: 'Cadastrar produto com saldo inicial (ADMIN, ESTOQUISTA)' })
  @ApiCreatedResponse({ description: 'Produto criado' })
  @ApiBadRequestResponse({ description: 'Dados invalidos' })
  @ApiConflictResponse({ description: 'SKU ja cadastrado' })
  async create(@Body() dto: CreateProdutoDto) {
    return ProdutoPresenter.toResponse(await this.criar.execute(dto));
  }

  @Get()
  @Roles(Role.ADMIN, Role.ESTOQUISTA, Role.MECANICO)
  @ApiOperation({ summary: 'Listar produtos com saldo' })
  @ApiOkResponse({ description: 'Produtos ordenados por nome' })
  async findAll() {
    return (await this.listar.execute()).map(ProdutoPresenter.toResponse);
  }

  @Get(':produtoId')
  @Roles(Role.ADMIN, Role.ESTOQUISTA, Role.MECANICO)
  @ApiOperation({ summary: 'Buscar produto por id' })
  @ApiOkResponse({ description: 'Produto encontrado' })
  @ApiNotFoundResponse({ description: 'Produto nao encontrado' })
  async findById(@Param('produtoId') produtoId: string) {
    return ProdutoPresenter.toResponse(await this.buscar.execute({ produtoId }));
  }

  @Patch(':produtoId')
  @Roles(Role.ADMIN, Role.ESTOQUISTA)
  @ApiOperation({ summary: 'Atualizar cadastro (nome, sku, preco) — nao altera saldo' })
  @ApiOkResponse({ description: 'Produto atualizado' })
  @ApiNotFoundResponse({ description: 'Produto nao encontrado' })
  @ApiConflictResponse({ description: 'SKU ja cadastrado em outro produto' })
  async update(@Param('produtoId') produtoId: string, @Body() dto: UpdateProdutoDto) {
    return ProdutoPresenter.toResponse(await this.atualizar.execute({ produtoId, ...dto }));
  }

  @Delete(':produtoId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover produto do catalogo (ADMIN)' })
  @ApiNoContentResponse({ description: 'Produto removido' })
  @ApiNotFoundResponse({ description: 'Produto nao encontrado' })
  async remove(@Param('produtoId') produtoId: string) {
    await this.remover.execute({ produtoId });
  }

  @Post(':produtoId/entradas')
  @Roles(Role.ADMIN, Role.ESTOQUISTA)
  @ApiOperation({ summary: 'Registrar entrada (reposicao) de estoque — transacional e auditada' })
  @ApiCreatedResponse({ description: 'Saldo atualizado' })
  @ApiNotFoundResponse({ description: 'Produto nao encontrado' })
  async entrada(@Param('produtoId') produtoId: string, @Body() dto: EntradaEstoqueDto) {
    return ProdutoPresenter.toResponse(
      await this.registrarEntrada.execute({ produtoId, quantidade: dto.quantidade }),
    );
  }

  @Get(':produtoId/movimentacoes')
  @Roles(Role.ADMIN, Role.ESTOQUISTA)
  @ApiOperation({ summary: 'Historico de movimentacoes (ENTRADA, BAIXA, DEVOLUCAO) do produto' })
  @ApiOkResponse({ description: 'Movimentacoes em ordem cronologica' })
  async movimentacoes(@Param('produtoId') produtoId: string) {
    return this.listarMovimentacoes.execute({ produtoId });
  }
}
