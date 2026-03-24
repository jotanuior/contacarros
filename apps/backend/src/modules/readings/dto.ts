import { IsDateString, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class LprReadingDto {
  @IsString()
  plate!: string;

  @IsString()
  cameraCode!: string;

  @IsDateString()
  capturedAt!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}

export class LprReadingBatchDto {
  readings!: LprReadingDto[];
}
