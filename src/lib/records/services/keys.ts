/**
 * React Query key factory for the record engine (MASTER-PROMPT §4 "Data";
 * gap/00 §4). Every key carries the scope ids it was read for, and
 * invalidation goes by prefix (`recordKeys.all`, `recordKeys.envelope(id)`).
 */
export const recordKeys = {
  all: ['records'] as const,
  envelope: (envelopeId: string) => ['records', 'envelope', envelopeId] as const,
  envelopeByEntity: (kindKey: string, entityId: string) => ['records', 'envelope-by-entity', kindKey, entityId] as const,
  envelopes: (companyId: string, filters: { vesselId?: string | null; kindKey?: string; status?: string } = {}) =>
    ['records', 'envelopes', companyId, filters] as const,
  events: (envelopeId: string) => ['records', 'envelope', envelopeId, 'events'] as const,
  slots: (envelopeId: string, cycle: number | 'current') => ['records', 'envelope', envelopeId, 'slots', cycle] as const,
  signatures: (envelopeId: string) => ['records', 'envelope', envelopeId, 'signatures'] as const,
  thread: (envelopeId: string, kind: string) => ['records', 'envelope', envelopeId, 'thread', kind] as const,
  attachments: (envelopeId: string) => ['records', 'envelope', envelopeId, 'attachments'] as const,
  links: (envelopeId: string) => ['records', 'envelope', envelopeId, 'links'] as const,
  exportJob: (jobId: string) => ['records', 'export-job', jobId] as const,
  myExports: (userId: string) => ['records', 'exports', userId] as const,
};
