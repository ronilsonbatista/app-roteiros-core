import { IsOptional, IsString, IsBoolean, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  stage?: 'ALL' | 'LEAD' | 'PROSPECT' | 'ACTIVE_USER' | 'CUSTOMER' | 'CHURNED';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasPurchases?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasTrips?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  hasConsent?: boolean;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minSpent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxSpent?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class LeadsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class UpdateConsentDto {
  @IsBoolean()
  consent: boolean;
}
