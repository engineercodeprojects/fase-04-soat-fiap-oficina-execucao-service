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
import { CreateServicoDto, UpdateServicoDto } from './dto/servico.dto';
import { ServicoPresenter } from './presenters/servico.presenter';
import { CriarServicoUseCase } from '../application/use-cases/criar-servico.use-case';
import { ListarServicosUseCase } from '../application/use-cases/listar-servicos.use-case';
import { BuscarServicoUseCase } from '../application/use-cases/buscar-servico.use-case';
import { AtualizarServicoUseCase } from '../application/use-cases/atualizar-servico.use-case';
import { RemoverServicoUseCase } from '../application/use-cases/remover-servico.use-case';

@ApiTags('Servicos (catalogo)')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT ausente ou invalido' })
@ApiForbiddenResponse({ description: 'Role insuficiente' })
@Controller('servicos')
export class ServicoController {
  constructor(
    private readonly criar: CriarServicoUseCase,
    private readonly listar: ListarServicosUseCase,
    private readonly buscar: BuscarServicoUseCase,
    private readonly atualizar: AtualizarServicoUseCase,
    private readonly remover: RemoverServicoUseCase,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cadastrar servico no catalogo (ADMIN)' })
  @ApiCreatedResponse({ description: 'Servico criado' })
  @ApiBadRequestResponse({ description: 'Dados invalidos' })
  async create(@Body() dto: CreateServicoDto) {
    return ServicoPresenter.toResponse(await this.criar.execute(dto));
  }

  @Get()
  @Roles(Role.ADMIN, Role.MECANICO, Role.ESTOQUISTA)
  @ApiOperation({ summary: 'Listar servicos do catalogo' })
  @ApiOkResponse({ description: 'Servicos ordenados por nome' })
  async findAll() {
    return (await this.listar.execute()).map(ServicoPresenter.toResponse);
  }

  @Get(':servicoId')
  @Roles(Role.ADMIN, Role.MECANICO, Role.ESTOQUISTA)
  @ApiOperation({ summary: 'Buscar servico por id' })
  @ApiOkResponse({ description: 'Servico encontrado' })
  @ApiNotFoundResponse({ description: 'Servico nao encontrado' })
  async findById(@Param('servicoId') servicoId: string) {
    return ServicoPresenter.toResponse(await this.buscar.execute({ servicoId }));
  }

  @Patch(':servicoId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Atualizar servico (ADMIN)' })
  @ApiOkResponse({ description: 'Servico atualizado' })
  @ApiNotFoundResponse({ description: 'Servico nao encontrado' })
  async update(@Param('servicoId') servicoId: string, @Body() dto: UpdateServicoDto) {
    return ServicoPresenter.toResponse(await this.atualizar.execute({ servicoId, ...dto }));
  }

  @Delete(':servicoId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover servico do catalogo (ADMIN)' })
  @ApiNoContentResponse({ description: 'Servico removido' })
  @ApiNotFoundResponse({ description: 'Servico nao encontrado' })
  async remove(@Param('servicoId') servicoId: string) {
    await this.remover.execute({ servicoId });
  }
}
