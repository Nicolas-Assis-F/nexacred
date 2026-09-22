import type { Request } from 'express';
export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'COMPLIANCE' | 'VIEWER';
}
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
