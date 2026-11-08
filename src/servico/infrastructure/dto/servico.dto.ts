import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateServicoDto {
  @ApiProperty({ description: 'Nome do servico', example: 'Troca de oleo' })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiPropertyOptional({ description: 'Descricao do servico', example: 'Troca de oleo e filtro' })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiProperty({ description: 'Preco base (mao de obra)', example: 120 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precoBase: number;
}

export class UpdateServicoDto extends PartialType(CreateServicoDto) {}
