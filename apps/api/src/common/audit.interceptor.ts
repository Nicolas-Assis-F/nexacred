import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, concatMap } from 'rxjs';
import { AuditService } from './audit.service.js';
import type { AuthenticatedRequest } from './request-context.js';
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return next.handle().pipe(
      concatMap(async (result: unknown) => {
        if (req.user && ['POST', 'PATCH', 'DELETE'].includes(req.method))
          await this.audit.record({
            actorId: req.user.id,
            action: `${req.method}_${req.route?.path ?? 'ACTION'}`,
            entityType: 'API',
            requestId: String(req.id ?? ''),
            entityId: typeof req.params.id === 'string' ? req.params.id : undefined,
          });
        return result;
      }),
    );
  }
}
