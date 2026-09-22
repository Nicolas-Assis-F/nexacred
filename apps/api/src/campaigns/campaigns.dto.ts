import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
export class CreateCampaignDto {
  @IsString() @MinLength(2) name!: string;
  @IsIn(['SMS', 'EMAIL']) channel!: 'SMS' | 'EMAIL';
  @IsUUID() templateId!: string;
  @IsUUID() segmentId!: string;
  @Type(() => Number) @IsInt() @Min(1) hourlyLimit = 100;
  @Type(() => Number) @IsInt() @Min(1) dailyLimit = 1000;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(23) allowedStartHour = 9;
  @Type(() => Number) @IsInt() @Min(1) @Max(24) allowedEndHour = 18;
  @IsBoolean() requireConsent = true;
}
