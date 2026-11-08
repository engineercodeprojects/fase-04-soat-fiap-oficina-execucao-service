import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProdutoDto {
  @ApiProperty({ description: 'Nome do produto/peca', example: 'Filtro de oleo' })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiProperty({ description: 'SKU (unico, normalizado em maiusculas)', example: 'FILTRO-OLEO-01' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ description: 'Preco unitario de venda', example: 45.9 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  preco: number;

  @ApiPropertyOptional({ description: 'Saldo inicial em estoque', example: 10, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  quantidadeEstoque?: number;
}

/** Saldo nao e editavel pelo cadastro — use `POST /produtos/:id/entradas`. */
export class UpdateProdutoDto extends PartialType(
  OmitType(CreateProdutoDto, ['quantidadeEstoque'] as const),
) {}

export class EntradaEstoqueDto {
  @ApiProperty({ description: 'Quantidade recebida (reposicao)', example: 5 })
  @IsInt()
  @Min(1)
  quantidade: number;
}
