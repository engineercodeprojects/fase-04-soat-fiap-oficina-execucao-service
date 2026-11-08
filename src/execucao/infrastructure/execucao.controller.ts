import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, Role, Roles } from '@guilhermeqmaia/oficina-kit/auth';
import {
  AtribuirMecanicoDto,
  ConcluirDiagnosticoDto,
  EnfileirarExecucaoDto,
  LiberarExecucaoDto,
  ListarExecucoesQueryDto,
  VincularProdutosDto,
  VincularServicosDto,
} from './dto/execucao.dto';
import { ExecucaoPresenter } from './presenters/execucao.presenter';
import { ConflitoComMotivoFilter } from './conflito-com-motivo.filter';
import { OsServiceIndisponivelFilter } from './os-service/os-service-indisponivel.filter';
import { EnfileirarExecucaoUseCase } from '../application/use-cases/enfileirar-execucao.use-case';
import { AtribuirMecanicoUseCase } from '../application/use-cases/atribuir-mecanico.use-case';
import { VincularServicosUseCase } from '../application/use-cases/vincular-servicos.use-case';
import { RemoverServicoDaExecucaoUseCase } from '../application/use-cases/remover-servico-da-execucao.use-case';
import { VincularProdutosUseCase } from '../application/use-cases/vincular-produtos.use-case';
import { ConcluirDiagnosticoUseCase } from '../application/use-cases/concluir-diagnostico.use-case';
import { IniciarExecucaoUseCase } from '../application/use-cases/iniciar-execucao.use-case';
import { FinalizarExecucaoUseCase } from '../application/use-cases/finalizar-execucao.use-case';
import { LiberarExecucaoUseCase } from '../application/use-cases/liberar-execucao.use-case';
import { BuscarExecucaoUseCase } from '../application/use-cases/buscar-execucao.use-case';
import { ListarExecucoesUseCase } from '../application/use-cases/listar-execucoes.use-case';
import { ListarMovimentacoesUseCase } from '../../produto/application/use-cases/listar-movimentacoes.use-case';

/**
 * Ordens na Execucao. Comandos do OS Service (role SERVICO, contrato
 * docs/contratos/http-interno.md): enfileirar, iniciar e DELETE (liberar).
 * Acoes do mecanico geram callbacks ao OS: diagnostico e finalizar.
 */
@ApiTags('Execucao (ordens)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente ou invalido' })
@ApiForbiddenResponse({ description: 'Role insuficiente ou execucao de outro mecanico' })
@UseFilters(ConflitoComMotivoFilter, OsServiceIndisponivelFilter)
@Controller('execucao/ordens')
export class ExecucaoController {
  constructor(
    private readonly enfileirar: EnfileirarExecucaoUseCase,
    private readonly atribuir: AtribuirMecanicoUseCase,
    private readonly vincularServicos: VincularServicosUseCase,
    private readonly removerServico: RemoverServicoDaExecucaoUseCase,
    private readonly vincularProdutos: VincularProdutosUseCase,
    private readonly concluirDiagnostico: ConcluirDiagnosticoUseCase,
    private readonly iniciarUc: IniciarExecucaoUseCase,
    private readonly finalizarUc: FinalizarExecucaoUseCase,
    private readonly liberar: LiberarExecucaoUseCase,
    private readonly buscar: BuscarExecucaoUseCase,
    private readonly listar: ListarExecucoesUseCase,
    private readonly movimentacoesUc: ListarMovimentacoesUseCase,
  ) {}

  @Post()
  @Roles(Role.SERVICO, Role.ADMIN)
  @ApiOperation({ summary: '`execucao.enfileirar` (OS Service): coloca a OS na fila' })
  @ApiCreatedResponse({ description: '{ numeroOS, posicaoFila } = execucao.enfileirada' })
  @ApiConflictResponse({ description: '{ motivo } = execucao.recusada (veiculo ja em execucao)' })
  async create(@Body() dto: EnfileirarExecucaoDto) {
    const { execucao, posicaoFila } = await this.enfileirar.execute(dto);
    return { numeroOS: execucao.osId, posicaoFila };
  }

  @Get()
  @Roles(Role.ADMIN, Role.MECANICO)
  @ApiOperation({ summary: 'Fila/lista de execucoes (MECANICO ve as suas e as NA_FILA)' })
  @ApiOkResponse({ description: 'Execucoes por ordem de chegada' })
  async findAll(@Query() query: ListarExecucoesQueryDto, @CurrentUser() ator: AuthenticatedUser) {
    return (await this.listar.execute({ ...query, ator })).map(ExecucaoPresenter.toResponse);
  }

  @Get(':numeroOS')
  @Roles(Role.ADMIN, Role.MECANICO, Role.SERVICO)
  @ApiOperation({ summary: 'Detalhe da execucao com servicos, pecas e valor total' })
  @ApiOkResponse({ description: 'Execucao' })
  @ApiNotFoundResponse({ description: 'Execucao nao encontrada' })
  async findOne(@Param('numeroOS') osId: string, @CurrentUser() ator: AuthenticatedUser) {
    return ExecucaoPresenter.toResponse(await this.buscar.execute({ osId, ator }));
  }

  @Post(':numeroOS/atribuir-mecanico')
  @Roles(Role.ADMIN, Role.MECANICO)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tira da fila atribuindo o mecanico (MECANICO so a si mesmo)' })
  @ApiOkResponse({ description: 'Execucao ATRIBUIDA' })
  @ApiConflictResponse({ description: 'Diagnostico ja concluido' })
  async atribuirMecanico(
    @Param('numeroOS') osId: string,
    @Body() dto: AtribuirMecanicoDto,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.atribuir.execute({ osId, mecanicoId: dto.mecanicoId, ator }),
    );
  }

  @Post(':numeroOS/servicos')
  @Roles(Role.MECANICO, Role.ADMIN)
  @ApiOperation({ summary: 'Vincula N servicos do catalogo (inicia o diagnostico)' })
  @ApiCreatedResponse({ description: 'Servicos vinculados; status EM_DIAGNOSTICO' })
  @ApiNotFoundResponse({ description: 'Execucao ou servico nao encontrado' })
  @ApiConflictResponse({ description: 'Diagnostico ja concluido' })
  async servicos(
    @Param('numeroOS') osId: string,
    @Body() dto: VincularServicosDto,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.vincularServicos.execute({ osId, servicoIds: dto.servicoIds, ator }),
    );
  }

  @Delete(':numeroOS/servicos/:servicoId')
  @Roles(Role.MECANICO, Role.ADMIN)
  @ApiOperation({ summary: 'Desvincula um servico (e suas pecas) da OS' })
  @ApiOkResponse({ description: 'Servico removido da execucao' })
  async removerServicoDaOs(
    @Param('numeroOS') osId: string,
    @Param('servicoId') servicoId: string,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.removerServico.execute({ osId, servicoId, ator }),
    );
  }

  @Post(':numeroOS/servicos/:servicoId/produtos')
  @Roles(Role.MECANICO, Role.ADMIN)
  @ApiOperation({ summary: 'Vincula pecas a um servico da OS (um produto pode atender varios)' })
  @ApiCreatedResponse({ description: 'Pecas vinculadas' })
  @ApiNotFoundResponse({ description: 'Execucao ou produto nao encontrado' })
  async produtos(
    @Param('numeroOS') osId: string,
    @Param('servicoId') servicoId: string,
    @Body() dto: VincularProdutosDto,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.vincularProdutos.execute({ osId, servicoId, produtos: dto.produtos, ator }),
    );
  }

  @Post(':numeroOS/diagnostico')
  @Roles(Role.MECANICO, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Conclui o diagnostico: baixa as pecas (transacao) e envia execucao.diagnostico-concluido',
  })
  @ApiOkResponse({ description: 'Execucao AGUARDANDO_APROVACAO, estoque baixado' })
  @ApiBadRequestResponse({ description: 'Diagnostico sem servicos/laudo' })
  @ApiConflictResponse({
    description: '{ motivo }: estoque insuficiente, status invalido ou OS recusou',
  })
  @ApiBadGatewayResponse({ description: 'OS Service indisponivel (baixa devolvida)' })
  async diagnostico(
    @Param('numeroOS') osId: string,
    @Body() dto: ConcluirDiagnosticoDto,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return ExecucaoPresenter.toResponse(
      await this.concluirDiagnostico.execute({ osId, diagnostico: dto.diagnostico, ator }),
    );
  }

  @Post(':numeroOS/iniciar')
  @Roles(Role.SERVICO, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '`execucao.iniciar` (OS Service, orcamento aprovado): EM_EXECUCAO' })
  @ApiOkResponse({ description: '{ numeroOS } = execucao.iniciada (idempotente)' })
  @ApiConflictResponse({ description: '{ motivo } = execucao.recusada (nao aguarda aprovacao)' })
  @ApiNotFoundResponse({ description: 'Execucao nao encontrada' })
  async iniciar(@Param('numeroOS') osId: string) {
    const execucao = await this.iniciarUc.execute({ osId });
    return { numeroOS: execucao.osId, status: execucao.status };
  }

  @Post(':numeroOS/finalizar')
  @Roles(Role.MECANICO, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Conclui o servico (EXECUTADA) e envia execucao.finalizada' })
  @ApiOkResponse({ description: 'Execucao EXECUTADA' })
  @ApiConflictResponse({ description: 'Execucao nao esta EM_EXECUCAO' })
  @ApiBadGatewayResponse({ description: 'OS Service indisponivel (status revertido)' })
  async finalizar(@Param('numeroOS') osId: string, @CurrentUser() ator: AuthenticatedUser) {
    return ExecucaoPresenter.toResponse(await this.finalizarUc.execute({ osId, ator }));
  }

  @Delete(':numeroOS')
  @Roles(Role.SERVICO, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '`execucao.liberar-reservas` (OS Service): cancela e devolve as pecas baixadas (rollback)',
  })
  @ApiOkResponse({
    description: '{ numeroOS, devolucoes } = execucao.reservas-liberadas (idempotente)',
  })
  @ApiConflictResponse({ description: 'Execucao ja em execucao/executada' })
  async liberarReservas(@Param('numeroOS') osId: string, @Body() dto: LiberarExecucaoDto) {
    const { execucao, devolucoes } = await this.liberar.execute({ osId, motivo: dto?.motivo });
    return { numeroOS: osId, status: execucao?.status ?? null, devolucoes };
  }

  @Get(':numeroOS/movimentacoes')
  @Roles(Role.ADMIN, Role.ESTOQUISTA, Role.MECANICO)
  @ApiOperation({ summary: 'Movimentacoes de estoque (BAIXA/DEVOLUCAO) da OS' })
  @ApiOkResponse({ description: 'Movimentacoes em ordem cronologica' })
  async movimentacoes(@Param('numeroOS') osId: string) {
    return this.movimentacoesUc.execute({ osId });
  }
}
