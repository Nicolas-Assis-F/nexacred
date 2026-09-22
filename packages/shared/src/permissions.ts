export const permissions = {
  ADMIN: ['*'],
  MANAGER: ['lead:read', 'import:write', 'campaign:write', 'campaign:start', 'conversation:write', 'segment:write', 'template:write'],
  OPERATOR: ['lead:read', 'conversation:write'],
  COMPLIANCE: ['lead:read', 'pii:read', 'suppression:write', 'consent:write', 'audit:read'],
  VIEWER: ['lead:read', 'dashboard:read'],
} as const;

export type Role = keyof typeof permissions;
export type Permission = 'import:write' | '*' | 'lead:read' | 'pii:read' | 'lead:export' | 'campaign:write' | 'campaign:start' | 'conversation:write' | 'segment:write' | 'template:write' | 'suppression:write' | 'consent:write' | 'audit:read' | 'user:write';

export function hasPermission(role: Role, permission: Permission): boolean {
  const allowed: readonly string[] = permissions[role];
  return allowed.includes('*') || allowed.includes(permission);
}
