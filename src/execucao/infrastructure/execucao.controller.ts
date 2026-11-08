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
  Query,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, Role, Roles } from '@guilhermeqmaia/oficina-kit/auth';
import {
  AtribuirMecanicoDto,
  AtualizarStatusDto,
  ListarExecucoesQueryDto,
  VincularProdutosDto,
  VincularServicosDto,
} from './dto/execucao.dto';
import { ExecucaoPresenter } from './presenters/execucao.presenter';
import { OsServiceIndisponivelFilter } from './os-service/os-service-indisponivel.filter';
import { AtribuirMecanicoUseCase } from '../application/use-cases/atribuir-mecanico.use-case';
import { AtualizarStatusExecucaoUseCase } from '../application/use-cases/atualizar-status-execucao.use-case';
import { VincularServicosUseCase } from '../application/use-cases/vincular-servicos.use-case';
import { RemoverServicoDaExecucaoUseCase } from '../application/use-cases/remover-servico-da-execucao.use-case';
import { VincularProdutosUseCase } from '../application/use-cases/vincular-produtos.use-case';
import { FecharDiagnosticoUseCase } from '../application/use-cases/fechar-diagnostico.use-case';
import { RollbackExecucaoUseCase } from '../application/use-cases/rollback-execucao.use-case';
import { BuscarExecucaoUseCase } from '../application/use-cases/buscar-execucao.use-case';
import { ListarExecucoesUseCase } from '../application/use-cases/listar-execucoes.use-case';
import { ListarMovimentacoesUseCase } from '../../produto/application/use-cases/listar-movimentacoes.use-case';
import { StatusExecucao } from '../domain/status-execucao';

@ApiTags('Execucoes')
@ApiBearerAuth()
@ApiParam({ name: 'osId', required: false, description: 'Numero/id da OS no OS Service' })
@ApiUnauthorizedResponse({ description: 'Token JWT ausente ou invalido' })
@ApiForbiddenResponse({ description: 'Role insuficiente ou execucao de outro mecanico' })
@UseFilters(OsServiceIndisponivelFilter)
@Controller('execucoes')
export class ExecucaoController {
  constructor(
    private readonly atribuir: AtribuirMecanicoUseCase,
    private readonly atualizarStatus: AtualizarStatusExecucaoUseCase,
    private readonly vincularServicos: VincularServicosUseCase,
    private readonly removerServico: RemoverServicoDaExecucaoUseCase,
    private readonly vincularProdutos: VincularProdutosUseCase,
    private readonly fechar: FecharDiagnosticoUseCase,
    private readonly rollbackUc: RollbackExecucaoUseCase,
    private readonly buscar: BuscarExecucaoUseCase,
    private readonly listar: ListarExecucoesUseCase,
    private readonly movimentacoesUc: ListarMovimentacoesUseCase,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.MECANICO)
  @ApiOperation({ summary: 'Fila de execucoes (MECANICO ve so as suas)' })
  @ApiOkResponse({ description: 'Execucoes por ordem de criacao' })
  async findAll(@Query() query: ListarExecucoesQueryDto, @CurrentUser() ator: AuthenticatedUser) {
    return (await this.listar.execute({ ...query, ator })).map(ExecucaoPresenter.toResponse);
  }

  @Get(':osId')
  @Roles(Role.ADMIN, Role.MECANICO, Role.SERVICO)
  @ApiOperation({ summary: 'Detalhe da execucao com servicos, pecas e valor total' })
  @ApiOkResponse({ description: 'Execucao' })
  @ApiNotFoundResponse({ description: 'Execucao nao encontrada' })
  async findOne(@Param('osId') osId: string, @CurrentUser() ator: AuthenticatedUser) {
    return ExecucaoPresenter.toResponse(await this.buscar.execute({ osId, ator }));
  }

  @Post(':osId/atribuir-mecanico')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Cria a execucao com o mecanico (ou reatribui) e propaga ao OS Service (ADMIN)',
  })
  @ApiCreatedResponse({ description: 'Execucao ATRIBUIDA' })
  @ApiConflictResponse({ description: 'Diagnostico ja fechado ou OS Service recusou' })
  @ApiBadGatewayResponse({ description: 'OS Service indisponivel (nada foi gravado)' })
  async atribuirMecanico(@Param('osId') osId: string, @Body() dto: AtribuirMecanicoDto) {
    return ExecucaoPresenter.toResponse(
      await this.atribuir.execute({ osId, mecanicoId: dto.mecanicoId }),
    );
  }

  @Patch(':osId/status')
  @Roles(Role.MECANICO, Role.ADMIN)
  @ApiOperation({
    summary: 'Atualiza status (EM_DIAGNOSTICO, EM_EXECUCAO, EXECUTADA) e propaga ao OS Service',
  })
  @ApiOkResponse({ description: 'Status atualizado' })
  @ApiBadRequestResponse({ description: 'Status nao alteravel por esta rota' })
  @ApiConflictResponse({ description: 'Transicao invalida ou OS Service recusou' })
  @ApiBadGatewayResponse({ description: 'OS Service indisponivel (status local revertido)' })
  async status(
    @Param('osId') osId: string,
    @Body() dto: AtualizarStatusDto,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.atualizarStatus.execute({ osId, status: dto.status, ator }),
    );
  }

  @Post(':osId/servicos')
  @Roles(Role.MECANICO, Role.ADMIN)
  @ApiOperation({ summary: 'Vincula N servicos do catalogo a OS (durante o diagnostico)' })
  @ApiCreatedResponse({ description: 'Servicos vinculados' })
  @ApiNotFoundResponse({ description: 'Execucao ou servico nao encontrado' })
  @ApiConflictResponse({ description: 'Diagnostico ja fechado' })
  async servicos(
    @Param('osId') osId: string,
    @Body() dto: VincularServicosDto,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.vincularServicos.execute({ osId, servicoIds: dto.servicoIds, ator }),
    );
  }

  @Delete(':osId/servicos/:servicoId')
  @Roles(Role.MECANICO, Role.ADMIN)
  @ApiOperation({ summary: 'Desvincula um servico (e suas pecas) da OS' })
  @ApiOkResponse({ description: 'Servico removido da execucao' })
  async removerServicoDaOs(
    @Param('osId') osId: string,
    @Param('servicoId') servicoId: string,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.removerServico.execute({ osId, servicoId, ator }),
    );
  }

  @Post(':osId/servicos/:servicoId/produtos')
  @Roles(Role.MECANICO, Role.ADMIN)
  @ApiOperation({
    summary: 'Vincula pecas a um servico da OS (um produto pode atender varios servicos)',
  })
  @ApiCreatedResponse({ description: 'Pecas vinculadas' })
  @ApiNotFoundResponse({ description: 'Execucao ou produto nao encontrado' })
  async produtos(
    @Param('osId') osId: string,
    @Param('servicoId') servicoId: string,
    @Body() dto: VincularProdutosDto,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.vincularProdutos.execute({ osId, servicoId, produtos: dto.produtos, ator }),
    );
  }

  @Post(':osId/fechar-diagnostico')
  @Roles(Role.MECANICO, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Fecha o diagnostico: baixa as pecas no estoque (transacao) e muda a OS para AGUARDANDO_APROVACAO',
  })
  @ApiOkResponse({ description: 'Execucao AGUARDANDO_APROVACAO, estoque baixado' })
  @ApiBadRequestResponse({ description: 'Diagnostico sem servicos' })
  @ApiConflictResponse({ description: 'Estoque insuficiente, transicao invalida ou OS recusou' })
  @ApiBadGatewayResponse({ description: 'OS Service indisponivel (baixa devolvida)' })
  async fecharDiagnostico(@Param('osId') osId: string, @CurrentUser() ator: AuthenticatedUser) {
    return ExecucaoPresenter.toResponse(await this.fechar.execute({ osId, ator }));
  }

  @Post(':osId/rollback')
  @Roles(Role.SERVICO, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Orcamento reprovado (chamado pelo OS Service): devolve as pecas ao estoque e marca CANCELADA',
  })
  @ApiOkResponse({ description: 'Execucao CANCELADA + devolucoes registradas (idempotente)' })
  @ApiConflictResponse({ description: 'Execucao ja em execucao/executada' })
  async rollback(@Param('osId') osId: string) {
    const { execucao, devolucoes } = await this.rollbackUc.execute({ osId });
    return { ...ExecucaoPresenter.toResponse(execucao), devolucoes };
  }

  @Post(':osId/executar')
  @Roles(Role.MECANICO, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia a execucao (EM_EXECUCAO) e propaga ao OS Service' })
  @ApiOkResponse({ description: 'Execucao EM_EXECUCAO' })
  @ApiConflictResponse({ description: 'Transicao invalida (precisa estar AGUARDANDO_APROVACAO)' })
  async executar(@Param('osId') osId: string, @CurrentUser() ator: AuthenticatedUser) {
    return ExecucaoPresenter.toResponse(
      await this.atualizarStatus.execute({ osId, status: StatusExecucao.EM_EXECUCAO, ator }),
    );
  }

  @Post(':osId/concluir')
  @Roles(Role.MECANICO, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Conclui a execucao (EXECUTADA) e propaga ao OS Service' })
  @ApiOkResponse({ description: 'Execucao EXECUTADA' })
  @ApiConflictResponse({ description: 'Transicao invalida (precisa estar EM_EXECUCAO)' })
  async concluir(@Param('osId') osId: string, @CurrentUser() ator: AuthenticatedUser) {
    return ExecucaoPresenter.toResponse(
      await this.atualizarStatus.execute({ osId, status: StatusExecucao.EXECUTADA, ator }),
    );
  }

  @Get(':osId/movimentacoes')
  @Roles(Role.ADMIN, Role.ESTOQUISTA, Role.MECANICO)
  @ApiOperation({ summary: 'Movimentacoes de estoque (BAIXA/DEVOLUCAO) da OS' })
  @ApiOkResponse({ description: 'Movimentacoes em ordem cronologica' })
  async movimentacoes(@Param('osId') osId: string) {
    return this.movimentacoesUc.execute({ osId });
  }
}
