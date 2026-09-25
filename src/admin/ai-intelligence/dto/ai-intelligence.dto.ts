import { IsString, IsOptional, IsBoolean, IsArray, IsNumber, Min, Max, IsEnum } from 'class-validator';
import { ContentStatus } from '@prisma/client';

export class UpdateGuidelineDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateKnowledgeArticleDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}

export class UpdateKnowledgeArticleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}

export class EditorialAssistDto {
  @IsString()
  action: 'GENERATE_DRAFT' | 'SUGGEST_TITLES' | 'SUMMARIZE' | 'SEO_META' | 'IMPROVE_TEXT';

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  context?: string;

  @IsOptional()
  @IsString()
  existingContent?: string;
}

export class PlaygroundSimulateDto {
  @IsString()
  destination: string;

  @IsNumber()
  @Min(1)
  @Max(15)
  numberOfDays: number;

  @IsOptional()
  @IsString()
  travelStyle?: string;

  @IsOptional()
  @IsString()
  budgetLevel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsString()
  additionalPrompt?: string;
}
