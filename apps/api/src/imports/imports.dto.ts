import { IsObject, IsOptional, IsString } from 'class-validator';
export class CreateImportDto {
  @IsOptional() @IsString() sheetName?: string;
  @IsObject() mapping!: Record<string, string>;
}
