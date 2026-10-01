import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyExpenseCategory } from '@prisma/client';

export class CreateCompanyExpenseDto {
  @ApiProperty({ description: 'Título ou descrição curta da despesa', example: 'Hospedagem AWS / Cloud' })
  @IsString()
  @IsNotEmpty({ message: 'title é obrigatório' })
  @MaxLength(200, { message: 'title não pode exceder 200 caracteres' })
  title: string;

  @ApiProperty({
    enum: CompanyExpenseCategory,
    description: 'Categoria da despesa',
    example: CompanyExpenseCategory.INFRA,
  })
  @IsEnum(CompanyExpenseCategory, {
    message: 'category deve ser uma categoria válida: INFRA, SAAS, MARKETING, PESSOAS, VIAGEM, OUTROS',
  })
  @IsNotEmpty({ message: 'category é obrigatória' })
  category: CompanyExpenseCategory;

  @ApiProperty({ description: 'Valor em centavos (positivo)', example: 15420 })
  @IsInt({ message: 'amountCents deve ser um número inteiro' })
  @Min(1, { message: 'amountCents deve ser maior que zero' })
  amountCents: number;

  @ApiPropertyOptional({ description: 'Moeda ISO (padrão BRL)', default: 'BRL', example: 'BRL' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency deve ter 3 letras maiúsculas (ex: BRL, USD)' })
  currency?: string;

  @ApiPropertyOptional({ description: 'Data em que o gasto ocorreu (ISO 8601)', example: '2026-10-01T14:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'spentAt deve ser uma data ISO válida' })
  spentAt?: string;

  @ApiPropertyOptional({ description: 'Mês de competência (YYYY-MM)', example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'competenceMonth deve estar no formato YYYY-MM' })
  competenceMonth?: string;

  @ApiPropertyOptional({ description: 'Fornecedor ou prestador do serviço', example: 'Amazon Web Services' })
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'vendor não pode exceder 150 caracteres' })
  vendor?: string;

  @ApiPropertyOptional({ description: 'Notas ou observações adicionais', example: 'Fatura de servidores de produção e banco' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'notes não pode exceder 1000 caracteres' })
  notes?: string;
}
