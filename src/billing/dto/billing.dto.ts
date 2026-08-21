import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductType, DiscountType } from '@prisma/client';

export enum PaymentMethodType {
  PIX = 'PIX',
  CARD = 'CARD',
}

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  type: ProductType;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: ProductType })
  @IsEnum(ProductType)
  @IsOptional()
  type?: ProductType;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateCouponDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  discountValue: number;

  @ApiPropertyOptional({ enum: ProductType, default: ProductType.ITINERARY_FULL_ACCESS })
  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateCouponDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsEnum(DiscountType)
  @IsOptional()
  discountType?: DiscountType;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  discountValue?: number;

  @ApiPropertyOptional({ enum: ProductType })
  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class CreateMockPurchaseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tripId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class CheckoutQuoteDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  couponCode?: string;
}

export class CheckoutPurchaseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tripId: string;

  @ApiProperty({ enum: PaymentMethodType })
  @IsEnum(PaymentMethodType)
  paymentMethod: PaymentMethodType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cardToken?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsNumber()
  @IsOptional()
  installments?: number;
}

export class CheckoutPricingDto {
  @ApiProperty()
  originalAmount: number;

  @ApiProperty()
  discountAmount: number;

  @ApiProperty()
  finalAmount: number;

  @ApiProperty()
  currency: string;
}

export class CheckoutProductDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;
}

export class CheckoutCouponDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  applied: boolean;

  @ApiProperty()
  discountType: string;

  @ApiProperty()
  discountValue: number;

  @ApiPropertyOptional()
  description?: string;
}

export class CheckoutSummaryDto {
  @ApiProperty()
  tripId: string;

  @ApiProperty()
  alreadyUnlocked: boolean;

  @ApiProperty()
  product: CheckoutProductDto;

  @ApiProperty()
  pricing: CheckoutPricingDto;

  @ApiPropertyOptional({ type: CheckoutCouponDto })
  coupon?: CheckoutCouponDto;

  @ApiPropertyOptional()
  existingPurchaseId?: string;

  @ApiPropertyOptional()
  existingPurchaseStatus?: string;

  @ApiProperty({ type: [String] })
  supportedPaymentMethods: string[];
}

export class CheckoutQuoteResponseDto {
  @ApiProperty()
  tripId: string;

  @ApiProperty()
  alreadyUnlocked: boolean;

  @ApiProperty()
  product: CheckoutProductDto;

  @ApiProperty()
  pricing: CheckoutPricingDto;

  @ApiPropertyOptional({ type: CheckoutCouponDto })
  coupon?: CheckoutCouponDto;

  @ApiProperty({ type: [String] })
  supportedPaymentMethods: string[];

  @ApiPropertyOptional()
  existingPurchaseId?: string;

  @ApiPropertyOptional()
  existingPurchaseStatus?: string;
}

export class PixDetailsDto {
  @ApiPropertyOptional()
  copyPaste?: string;

  @ApiPropertyOptional()
  qrCodeBase64?: string;

  @ApiPropertyOptional()
  expiresAt?: string;

  @ApiPropertyOptional()
  ticketUrl?: string;
}

export class CheckoutResponseDto {
  @ApiProperty()
  purchaseId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  paymentMethod: string;

  @ApiPropertyOptional({ type: PixDetailsDto })
  pixDetails?: PixDetailsDto;

  @ApiPropertyOptional({ type: CheckoutPricingDto })
  pricing?: CheckoutPricingDto;
}
