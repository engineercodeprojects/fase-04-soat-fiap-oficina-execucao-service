import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { StatusExecucao } from '../../domain/status-execucao';

/** Corpo de `execucao.enfileirar` (contrato http-interno do OS Service). */
export class EnfileirarExecucaoDto {
  @ApiProperty({ example: 'OS-2026-0001' })
  @IsString()
  @IsNotEmpty()
  numeroOS: string;

  @ApiProperty({ example: '7b2f0c1e-...' })
  @IsString()
  @IsNotEmpty()
  veiculoId: string;

  @ApiPropertyOptional({ example: 'Barulho ao frear' })
  @IsString()
  @IsOptional()
  descricaoProblema?: string;
}

export class LiberarExecucaoDto {
  @ApiPropertyOptional({ example: 'Orcamento reprovado pelo cliente' })
  @IsString()
  @IsOptional()
  motivo?: string;
}

export class AtribuirMecanicoDto {
  @ApiProperty({
    description: 'Id do mecanico (claim `sub` do usuario MECANICO)',
    example: 'mec-1',
  })
  @IsString()
  @IsNotEmpty()
  mecanicoId: string;
}

export class ConcluirDiagnosticoDto {
  @ApiProperty({ description: 'Laudo do diagnostico', example: 'Pastilhas gastas; oleo vencido' })
  @IsString()
  @IsNotEmpty()
  diagnostico: string;
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
