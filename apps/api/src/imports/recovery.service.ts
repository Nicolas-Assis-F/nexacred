import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma.service.js';
@Injectable()
export class ImportRecovery implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('import-processing') private readonly queue: Queue,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.recover(), 15000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async recover() {
    if (this.running) return;
    this.running = true;
    try {
      for (const i of await this.prisma.import.findMany({
        where: { status: 'QUEUED' },
        take: 100,
      })) {
        await this.queue.add(
          'import-xlsb',
          { importId: i.id, storageKey: i.storageKey },
          {
            jobId: `import-${i.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
          },
        );
      }
    } catch {
      /* Persistent QUEUED state is retried on the next reconciliation. */
    } finally {
      this.running = false;
    }
  }
}
