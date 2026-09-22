import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
export class CreateSegmentDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsObject() filters!: Record<string, unknown>;
}
