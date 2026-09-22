import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ZodError } from '@nexacred/shared';
import { Prisma } from '@nexacred/database';
import type { Response } from 'express';
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (error instanceof ZodError) {
      response
        .status(400)
        .json({ message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      response
        .status(error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : 400)
        .json({
          message:
            error.code === 'P2025'
              ? 'Registro não encontrado'
              : error.code === 'P2002'
                ? 'Registro já existe'
                : 'Dados inválidos',
        });
      return;
    }
    response
      .status(500)
      .json({ message: 'Falha interna. Verifique a disponibilidade dos serviços.' });
  }
}
