import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
export class AssignConversationDto {
  @IsUUID() userId!: string;
}
export class SendConversationMessageDto {
  @IsString() body!: string;
}
export class UpdateConversationDto {
  @IsOptional()
  @IsIn([
    'NEW',
    'INTERESTED',
    'NOT_INTERESTED',
    'QUALIFYING',
    'QUALIFIED',
    'WAITING_HUMAN',
    'OPT_OUT',
    'CLOSED',
  ])
  status?:
    | 'NEW'
    | 'INTERESTED'
    | 'NOT_INTERESTED'
    | 'QUALIFYING'
    | 'QUALIFIED'
    | 'WAITING_HUMAN'
    | 'OPT_OUT'
    | 'CLOSED';
  @IsOptional() @IsString() note?: string;
}
