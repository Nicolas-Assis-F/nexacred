import { PermissionGuard, RequirePermission } from '../common/rbac.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service.js';
import type { AuthenticatedRequest } from '../common/request-context.js';
import { AuditService } from '../common/audit.service.js';
import {
  AssignConversationDto,
  SendConversationMessageDto,
  UpdateConversationDto,
} from './conversations.dto.js';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('message-send') private readonly queue: Queue,
  ) {}
  @Get() list() {
    return this.prisma.conversation.findMany({
      include: {
        lead: { select: { name: true, cpfLast4: true, organization: true, position: true } },
        contact: { select: { maskedValue: true } },
        assignedTo: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
  }
  @Get(':id') get(@Param('id') id: string) {
    return this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            cpfLast4: true,
            organization: true,
            position: true,
            availableMargin: true,
          },
        },
        contact: { select: { maskedValue: true } },
        assignedTo: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }
  @Post(':id/assign') @RequirePermission('conversation:write') async assign(
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.prisma.conversation.update({
      where: { id },
      data: { assignedToId: dto.userId, status: 'WAITING_HUMAN' },
    });
    await this.audit.record({
      actorId: req.user.id,
      action: 'CONVERSATION_ASSIGNED',
      entityType: 'Conversation',
      entityId: id,
    });
    return result;
  }
  @Patch(':id') @RequirePermission('conversation:write') update(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    if (dto.status === 'OPT_OUT')
      throw new BadRequestException('Use bloquear contato ou simule SAIR para registrar supressão');
    return this.prisma.conversation.update({ where: { id }, data: dto });
  }
  @Post(':id/messages') @RequirePermission('conversation:write') async send(
    @Param('id') id: string,
    @Body() dto: SendConversationMessageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id } });
    const message = await this.prisma.message.create({
      data: {
        conversationId: id,
        contactId: conversation.contactId,
        provider: conversation.channel === 'WHATSAPP' ? 'baileys' : 'mock',
        metadata: { chatwootPending: true },
        direction: 'OUTBOUND',
        status: 'QUEUED',
        body: dto.body,
      },
    });
    await this.audit.record({
      actorId: req.user.id,
      action: 'MESSAGE_REQUESTED',
      entityType: 'Message',
      entityId: message.id,
    });
    await this.queue.add(
      'send-message',
      { messageId: message.id },
      {
        jobId: `message-${message.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    return message;
  }
}
