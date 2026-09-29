import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  Min,
  IsInt,
  Max,
  IsIn,
  IsEmail,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CustomersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ALL', 'CUSTOMER_PAID', 'CUSTOMER_UNPAID'])
  stage?: 'ALL' | 'CUSTOMER_PAID' | 'CUSTOMER_UNPAID';

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  hasPurchases?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  hasTrips?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
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
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
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

export class ContactsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 15;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
  @IsOptional()
  @IsIn(['CONTACT', 'QUALIFIED', 'INACTIVE'])
  status?: 'CONTACT' | 'QUALIFIED' | 'INACTIVE';
}

export class SaveContactDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName: string;
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
  @IsIn(['CONTACT', 'QUALIFIED', 'INACTIVE'])
  status: 'CONTACT' | 'QUALIFIED' | 'INACTIVE';
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
