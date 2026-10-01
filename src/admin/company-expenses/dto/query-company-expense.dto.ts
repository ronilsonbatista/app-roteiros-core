import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyExpenseCategory } from '@prisma/client';

export class QueryCompanyExpenseDto {
  @ApiPropertyOptional({ description: 'Mês de competência (YYYY-MM)', example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'competenceMonth deve estar no formato YYYY-MM' })
  competenceMonth?: string;

  @ApiPropertyOptional({ description: 'Alias para competenceMonth (YYYY-MM)', example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month deve estar no formato YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({
    enum: CompanyExpenseCategory,
    description: 'Filtrar por categoria',
  })
  @IsOptional()
  @IsEnum(CompanyExpenseCategory, {
    message: 'category deve ser uma categoria válida: INFRA, SAAS, MARKETING, PESSOAS, VIAGEM, OUTROS',
  })
  category?: CompanyExpenseCategory;

  @ApiPropertyOptional({ description: 'Busca por texto no título ou fornecedor', example: 'AWS' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Incluir despesas arquivadas/soft-deleted', default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeArchived?: boolean = false;

  @ApiPropertyOptional({ description: 'Número da página', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Itens por página', default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Campo de ordenação', default: 'spentAt', enum: ['spentAt', 'amountCents', 'createdAt'] })
  @IsOptional()
  @IsIn(['spentAt', 'amountCents', 'createdAt'])
  orderBy?: 'spentAt' | 'amountCents' | 'createdAt' = 'spentAt';

  @ApiPropertyOptional({ description: 'Direção da ordenação', default: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}

export class QueryCompanyExpenseSummaryDto {
  @ApiPropertyOptional({ description: 'Mês de competência (YYYY-MM)', example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'competenceMonth deve estar no formato YYYY-MM' })
  competenceMonth?: string;

  @ApiPropertyOptional({ description: 'Alias para competenceMonth (YYYY-MM)', example: '2026-10' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month deve estar no formato YYYY-MM' })
  month?: string;
}
