import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { StatusExecucao } from '../../domain/status-execucao';
import { STATUS_ALTERAVEIS_DIRETAMENTE } from '../../application/use-cases/atualizar-status-execucao.use-case';

export class AtribuirMecanicoDto {
  @ApiProperty({
    description: 'Id do mecanico (claim `sub` do usuario MECANICO)',
    example: 'mec-1',
  })
  @IsString()
  @IsNotEmpty()
  mecanicoId: string;
}

export class AtualizarStatusDto {
  @ApiProperty({ enum: STATUS_ALTERAVEIS_DIRETAMENTE, example: StatusExecucao.EM_EXECUCAO })
  @IsIn(STATUS_ALTERAVEIS_DIRETAMENTE)
  status: (typeof STATUS_ALTERAVEIS_DIRETAMENTE)[number];
}

export class VincularServicosDto {
  @ApiProperty({ type: [String], description: 'Ids do catalogo de servicos', example: ['srv-1'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  servicoIds: string[];
}

export class ItemProdutoDto {
  @ApiProperty({ example: 'prd-1' })
  @IsString()
  @IsNotEmpty()
  produtoId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantidade: number;
}

export class VincularProdutosDto {
  @ApiProperty({ type: [ItemProdutoDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ItemProdutoDto)
  produtos: ItemProdutoDto[];
}

export class ListarExecucoesQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mecanicoId?: string;

  @ApiPropertyOptional({ enum: StatusExecucao })
  @IsEnum(StatusExecucao)
  @IsOptional()
  status?: StatusExecucao;
}
