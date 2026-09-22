import { z } from 'zod';

export const segmentFiltersSchema = z.object({
  organization: z.string().trim().min(1).optional(),
  position: z.string().trim().min(1).optional(),
  employmentStatus: z.string().trim().min(1).optional(),
  availableMargin: z.object({ min: z.number().nonnegative().optional(), max: z.number().nonnegative().optional() }).optional(),
  contractsCount: z.object({ min: z.number().int().nonnegative().optional(), max: z.number().int().nonnegative().optional() }).optional(),
  importId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INVALID', 'SUPPRESSED', 'ARCHIVED']).optional(),
}).strict();
export type SegmentFilters = z.infer<typeof segmentFiltersSchema>;

export const importMappingSchema = z.object({
  cpf: z.string().min(1), name: z.string().min(1), phone1: z.string().optional(), phone2: z.string().optional(),
  email1: z.string().optional(), email2: z.string().optional(), organizationCode: z.string().optional(),
  organization: z.string().optional(), employmentCode: z.string().optional(), position: z.string().optional(),
  employmentStatus: z.string().optional(), marginBase: z.string().optional(), availableMargin: z.string().optional(),
  contractsCount: z.string().optional(), currentLoanDiscount: z.string().optional(),
}).strict();
export type ImportMapping = z.infer<typeof importMappingSchema>;
