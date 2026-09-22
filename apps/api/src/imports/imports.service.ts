import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { importMappingSchema } from '@nexacred/shared';
import { PrismaService } from '../common/prisma.service.js';
import { AuditService } from '../common/audit.service.js';

@Injectable()
export class ImportsService {
  private readonly storage = new S3Client({
    endpoint: `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://${process.env.MINIO_ENDPOINT ?? 'minio'}:${process.env.MINIO_PORT ?? '9000'}`,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'nexacred',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'replace-minio-secret',
    },
  });
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue('import-processing') private readonly queue: Queue,
  ) {}

  async create(
    file: Express.Multer.File,
    mappingJson: string,
    sheetName: string | undefined,
    actorId: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo obrigatório');
    try {
      if (!file.originalname.toLowerCase().endsWith('.xlsb'))
        throw new BadRequestException('Apenas arquivos .xlsb são aceitos');
      let parsed: unknown;
      try {
        parsed = JSON.parse(mappingJson);
      } catch {
        throw new BadRequestException('Mapeamento JSON inválido');
      }
      const validation = importMappingSchema.safeParse(parsed);
      if (!validation.success)
        throw new BadRequestException(
          'Mapeamento inválido. Informe os cabeçalhos de CPF e nome e confira os campos opcionais.',
        );
      const mapping = validation.data;
      const record = await this.prisma.import.create({
        data: {
          filename: file.originalname,
          storageKey: 'pending',
          sheetName: sheetName?.trim() || null,
          mapping,
          status: 'UPLOADED',
        },
      });
      const storageKey = `imports/${record.id}/${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      try {
        await this.storage.send(
          new PutObjectCommand({
            Bucket: process.env.MINIO_BUCKET ?? 'imports',
            Key: storageKey,
            Body: createReadStream(file.path),
            ContentLength: file.size,
            ContentType: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
          }),
        );
        await this.prisma.import.update({
          where: { id: record.id },
          data: { storageKey, status: 'QUEUED' },
        });
      } catch {
        await this.prisma.import.update({
          where: { id: record.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Não foi possível salvar o arquivo. Verifique o MinIO e envie novamente.',
          },
        });
        throw new BadRequestException(
          'Não foi possível salvar o arquivo no armazenamento. Verifique o MinIO e envie novamente.',
        );
      }
      // Once stored, QUEUED is durable. Recovery schedules it after a Redis outage.
      await this.queue
        .add(
          'import-xlsb',
          { importId: record.id, storageKey },
          {
            jobId: `import-${record.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 1000,
          },
        )
        .catch(() => undefined);
      await this.audit.record({
        actorId,
        action: 'IMPORT_CREATED',
        entityType: 'Import',
        entityId: record.id,
      });
      return { importId: record.id, status: 'QUEUED' };
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }
  list() {
    return this.prisma.import.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async retry(id: string, actorId: string) {
    const record = await this.get(id);
    if (record.status !== 'FAILED')
      throw new BadRequestException('Somente importações com falha podem ser retomadas.');
    try {
      await this.storage.send(
        new HeadObjectCommand({
          Bucket: process.env.MINIO_BUCKET ?? 'imports',
          Key: record.storageKey,
        }),
      );
    } catch {
      throw new BadRequestException(
        'O arquivo não está mais no armazenamento. Faça um novo upload.',
      );
    }
    const old = await this.queue.getJob(`import-${id}`);
    if (old && ['active', 'waiting', 'delayed'].includes(await old.getState()))
      throw new BadRequestException(
        'A fila ainda está tentando novamente. Aguarde alguns segundos.',
      );
    if (old) await old.remove();
    const claimed = await this.prisma.import.updateMany({
      where: { id, status: 'FAILED' },
      data: { status: 'QUEUED', errorMessage: null },
    });
    if (!claimed.count) throw new BadRequestException('Importação já retomada.');
    // QUEUED is an outbox state: recovery also schedules it if Redis is temporarily unavailable.
    await this.queue
      .add(
        'import-xlsb',
        { importId: id, storageKey: record.storageKey },
        {
          jobId: `import-${id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
        },
      )
      .catch(() => undefined);
    await this.audit.record({
      actorId,
      action: 'IMPORT_RETRIED',
      entityType: 'Import',
      entityId: id,
    });
    return this.get(id);
  }
  async get(id: string) {
    const value = await this.prisma.import.findUnique({ where: { id } });
    if (!value) throw new NotFoundException();
    return value;
  }
  errors(id: string, page = 1) {
    return this.prisma.importError.findMany({
      where: { importId: id },
      orderBy: { rowNumber: 'asc' },
      skip: (Math.max(1, page) - 1) * 100,
      take: 100,
    });
  }
}
