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
  @IsString()
  eventKey?: string;

  @IsOptional()
  @IsString()
  cameraVehicleType?: string;

  @IsOptional()
  @IsString()
  cameraVehicleBrand?: string;

  @IsOptional()
  @IsString()
  cameraDirection?: string;

  @IsOptional()
  @IsString()
  plateColor?: string;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}

export class LprReadingBatchDto {
  readings!: LprReadingDto[];
}

export class ImportIntelbrasCsvDto {
  @IsString()
  cameraCode!: string;

  @IsOptional()
  @IsString()
  delimiter?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  defaultConfidence?: number;
}
