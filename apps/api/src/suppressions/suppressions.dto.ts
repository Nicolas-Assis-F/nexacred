import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
export class CreateSuppressionDto {
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsIn(['OPT_OUT', 'BLOCKLIST', 'COMPLIANCE', 'INVALID', 'MANUAL']) reason!:
    'OPT_OUT' | 'BLOCKLIST' | 'COMPLIANCE' | 'INVALID' | 'MANUAL';
  @IsString() source!: string;
}
