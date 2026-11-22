/**
 * Status tone registry (BUILD-PLAN A6; gap/10 DS12, §A.8; DECISIONS C5).
 *
 * - covers the status vocabularies stored today (read from the module
 *   constants where they exist, so a new status there fails this test)
 * - pins the meaning of the tones that matter for compliance
 * - never throws: unknown domain or status → neutral with a readable label
 */
import { describe, expect, it } from 'vitest';
import { TONES } from '@/components/ui/tones';
import {
  STATUS_DOMAINS,
  STATUS_REGISTRY,
  humanizeStatus,
  normalizeStatusKey,
  statusLabel,
  statusMeta,
  statusTone,
  statusVocabulary,
  type StatusDomain,
} from '@/shared/components/status';
import { EXPIRY_BUCKETS, EXPIRY_BUCKET_LABELS } from '@/lib/records/expiry';
import { ENVELOPE_STATUSES } from '@/lib/records/types';
import { AUDIT_STATUSES, FINDING_STATUSES, FINDING_TYPES } from '@/modules/audits/constants';
import { FAMILIARIZATION_STATUSES, TRAINING_STATUSES } from '@/modules/training/constants';
import { PERMIT_STATUS_OPTIONS, RA_STATUS_OPTIONS } from '@/modules/risk-assessments/constants';
import { SUBMISSION_STATUSES } from '@/modules/ism/constants';
import { CERTIFICATE_STATUS } from '@/modules/certificates/constants';
import { APPLICATION_STATUS_CONFIG } from '@/modules/development/constants';
import { DOCUMENT_STATUSES } from '@/modules/documents/constants';
import type { NCStatus, SubmissionStatus as WorkRestSubmissionStatus } from '@/modules/work-rest/types';
import type { FeedbackStatus } from '@/modules/feedback/types';

/** Vocabularies that only exist as TS unions or inline literals today. */
const INCIDENT_STATUSES = ['Open', 'Under Investigation', 'Closed'] as const; // incidents/hooks/useIncidents.ts
const CAPA_STATUSES = ['Open', 'In Progress', 'Verification', 'Closed'] as const; // ism CorrectiveActions/NonConformities, incidents getCAPAStatusColor
const WORK_REST_SUBMISSION: readonly WorkRestSubmissionStatus[] = [
  'draft', 'submitted', 'crew_signed', 'hod_reviewed', 'hod_signed', 'captain_reviewed', 'locked', 'reopened',
];
const WORK_REST_NC: readonly NCStatus[] = ['open', 'reviewed', 'justified', 'corrected', 'accepted_by_captain', 'dismissed'];
const CREW_STATUSES = ['Active', 'On Leave', 'Inactive', 'Pending', 'Invited'] as const; // crew FullCrewEditModal zod enum
const CREW_ACCOUNT_STATUSES = ['active', 'disabled', 'invited', 'not_invited'] as const; // crew CrewRoster
const SUPPORT_LIVE = ['open', 'in_progress', 'resolved', 'closed'] as const; // support_tickets.status today
const SUPPORT_TARGET = [
  'requested', 'awaiting_approval', 'approved', 'in_progress', 'testing', 'to_be_invoiced', 'complete', 'cancelled',
  'with_helpdesk', 'resolved_internally',
] as const; // gap/03 workflow 2 + gap/09
const FEEDBACK: readonly FeedbackStatus[] = ['submitted', 'in_review', 'fixed'];

const COVERAGE: Array<[StatusDomain, readonly string[]]> = [
  ['incident', INCIDENT_STATUSES],
  ['corrective_action', CAPA_STATUSES],
  ['non_conformity', CAPA_STATUSES],
  ['audit', AUDIT_STATUSES.map((s) => s.value)],
  ['audit_finding', FINDING_STATUSES.map((s) => s.value)],
  ['audit_finding_type', FINDING_TYPES.map((s) => s.value)],
  ['training', TRAINING_STATUSES.map((s) => s.value)],
  ['familiarization', FAMILIARIZATION_STATUSES.map((s) => s.value)],
  ['training_application', Object.keys(APPLICATION_STATUS_CONFIG)],
  ['risk_assessment', RA_STATUS_OPTIONS.map((s) => s.value)],
  ['permit', PERMIT_STATUS_OPTIONS.map((s) => s.value)],
  ['form_submission', SUBMISSION_STATUSES],
  ['work_rest_submission', WORK_REST_SUBMISSION],
  ['work_rest_nc', WORK_REST_NC],
  ['certificate', Object.keys(CERTIFICATE_STATUS)],
  ['document', DOCUMENT_STATUSES.map((s) => s.value)],
  ['crew', CREW_STATUSES],
  ['crew_account', CREW_ACCOUNT_STATUSES],
  ['support', [...SUPPORT_LIVE, ...SUPPORT_TARGET]],
  ['feedback', FEEDBACK],
  ['envelope', ENVELOPE_STATUSES],
  ['expiry', EXPIRY_BUCKETS],
  ['whose_move', ['vessel', 'company', 'none']],
];

describe('registry shape', () => {
  it('covers every domain BUILD-PLAN A6 names', () => {
    for (const d of [
      'incident', 'audit', 'training', 'risk_assessment', 'corrective_action', 'work_rest_submission', 'work_rest_nc',
      'certificate', 'crew', 'support', 'feedback',
    ]) {
      expect(STATUS_DOMAINS, d).toContain(d);
    }
  });

  it.each(STATUS_DOMAINS)('%s: keys are normalised, tones valid, labels present', (domain) => {
    const vocabulary = STATUS_REGISTRY[domain] as Record<string, { tone: string; label: string }>;
    expect(Object.keys(vocabulary).length).toBeGreaterThan(0);
    for (const [key, entry] of Object.entries(vocabulary)) {
      expect(normalizeStatusKey(key), `${domain}.${key}`).toBe(key);
      expect(TONES as readonly string[], `${domain}.${key}`).toContain(entry.tone);
      expect(entry.label.trim().length, `${domain}.${key}`).toBeGreaterThan(0);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(STATUS_REGISTRY.incident)).toBe(true);
    expect(Object.isFrozen(STATUS_REGISTRY.incident.open)).toBe(true);
  });
});

describe('covers the vocabularies stored today', () => {
  it.each(COVERAGE.map(([d, list]) => [d, list] as const))('%s', (domain, statuses) => {
    for (const status of statuses) {
      expect(statusMeta(domain, status).known, `${domain}: "${status}"`).toBe(true);
    }
  });
});

describe('meanings (gap/10 §A.8)', () => {
  it.each<[StatusDomain, string, string]>([
    // expiry buckets, DECISIONS C5
    ['expiry', 'expired', 'danger'],
    ['expiry', 'expiring_soon', 'orange'],
    ['expiry', 'expiring', 'warn'],
    ['expiry', 'valid', 'ok'],
    ['expiry', 'no_expiry', 'neutral'],
    // whose move: vessel info, company purple
    ['whose_move', 'vessel', 'info'],
    ['whose_move', 'company', 'purple'],
    ['whose_move', 'none', 'neutral'],
    // vessel done ≠ company done (T-78)
    ['envelope', 'submitted', 'purple'],
    ['envelope', 'awaiting_company_close', 'purple'],
    ['envelope', 'closed', 'ok'],
    ['envelope', 'void', 'neutral'],
    ['form_submission', 'PENDING_SIGNATURE', 'purple'],
    ['form_submission', 'SIGNED', 'ok'],
    ['form_submission', 'REJECTED', 'danger'],
    ['corrective_action', 'Verification', 'purple'],
    // failure and overdue are danger
    ['corrective_action', 'overdue', 'danger'],
    ['familiarization', 'Overdue', 'danger'],
    ['risk_assessment', 'Expired', 'danger'],
    ['permit', 'Expired', 'danger'],
    ['certificate', 'Expired', 'danger'],
    ['training', 'Expired', 'danger'],
    ['work_rest_nc', 'open', 'danger'],
    ['work_rest_compliance', 'non_compliant', 'danger'],
    ['audit_finding_type', 'Major_NC', 'danger'],
    ['crew_account', 'disabled', 'danger'],
    // live work is signal, inactive is neutral
    ['permit', 'Active', 'signal'],
    ['incident', 'Under Investigation', 'signal'],
    ['permit', 'Cancelled', 'neutral'],
    ['risk_assessment', 'Draft', 'neutral'],
    // legacy "Expiring_Soon" (inside the 90-day alert window) is warn, not the ≤ 30 d tier
    ['certificate', 'Expiring_Soon', 'warn'],
    ['training', 'Expiring_Soon', 'warn'],
    // controlled documents: review is live work, obsolete is withdrawn (inactive)
    ['document', 'Under_Review', 'signal'],
    ['document', 'Approved', 'ok'],
    ['document', 'Obsolete', 'neutral'],
  ])('%s %s → %s', (domain, status, tone) => {
    expect(statusTone(domain, status)).toBe(tone);
  });

  it('expiry labels are the C5 labels from the expiry engine', () => {
    for (const bucket of EXPIRY_BUCKETS) expect(statusLabel('expiry', bucket)).toBe(EXPIRY_BUCKET_LABELS[bucket]);
    expect(statusLabel('expiry', 'expiring_soon')).toBe('≤ 30 d');
    expect(statusLabel('expiry', 'expiring')).toBe('Due ≤ window');
  });

  it('tenants see to_be_invoiced as complete', () => {
    expect(statusMeta('support', 'to_be_invoiced')).toEqual({ tone: 'ok', label: 'Complete · invoicing', known: true });
  });
});

describe('matching', () => {
  it('ignores case, spaces, hyphens and underscores', () => {
    for (const s of ['Under Investigation', 'under_investigation', 'UNDER-INVESTIGATION', '  under   investigation ']) {
      expect(statusTone('incident', s), s).toBe('signal');
      expect(statusLabel('incident', s), s).toBe('Under investigation');
    }
    expect(statusTone('crew', 'On Leave')).toBe(statusTone('crew', 'on_leave'));
  });

  it('normalizeStatusKey', () => {
    expect(normalizeStatusKey('CAPA_Assigned')).toBe('capa_assigned');
    expect(normalizeStatusKey('in--progress')).toBe('in_progress');
    expect(normalizeStatusKey(3)).toBe('3');
    expect(normalizeStatusKey(null)).toBe('');
    expect(normalizeStatusKey({})).toBe('');
  });
});

describe('unknown input never throws', () => {
  it('unknown status → neutral with the raw value humanised', () => {
    expect(statusMeta('incident', 'Escalated_To_Flag')).toEqual({ tone: 'neutral', label: 'Escalated to flag', known: false });
  });

  it('unknown domain → neutral', () => {
    const domain = 'not-a-domain' as unknown as StatusDomain;
    expect(statusTone(domain, 'open')).toBe('neutral');
    expect(statusLabel(domain, 'open')).toBe('Open');
    expect(statusVocabulary(domain)).toEqual([]);
  });

  it('prototype keys are not statuses', () => {
    for (const s of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(statusMeta('incident', s).known, s).toBe(false);
      expect(statusTone('incident', s), s).toBe('neutral');
    }
    expect(statusTone('__proto__' as unknown as StatusDomain, 'open')).toBe('neutral');
  });

  it.each([null, undefined, '', '   ', 0, 42, NaN, {}, [], true, Symbol('x'), () => 'open'])(
    'status %s',
    (value) => {
      expect(() => statusMeta('incident', value)).not.toThrow();
      expect(statusTone('incident', value)).toBe('neutral');
      expect(typeof statusLabel('incident', value)).toBe('string');
    },
  );

  it('random strings resolve to a valid tone', () => {
    const alphabet = 'abcXYZ_- 0123ÄΩ';
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i += 1) {
      const s = Array.from({ length: Math.floor(rand() * 12) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');
      const domain = STATUS_DOMAINS[i % STATUS_DOMAINS.length];
      expect(TONES as readonly string[]).toContain(statusTone(domain, s));
    }
  });
});

describe('labels', () => {
  it.each([
    ['in_progress', 'In progress'],
    ['PENDING_SIGNATURE', 'Pending signature'],
    ['CAPA_Assigned', 'CAPA assigned'],
    ['Under Investigation', 'Under investigation'],
    ['', '—'],
    [null, '—'],
  ])('humanizeStatus(%s) = %s', (input, out) => {
    expect(humanizeStatus(input)).toBe(out);
  });

  it('statusVocabulary lists a domain in registry order', () => {
    expect(statusVocabulary('feedback').map((e) => e.status)).toEqual(['submitted', 'in_review', 'fixed']);
    expect(statusVocabulary('feedback')[0]).toEqual({ status: 'submitted', tone: 'info', label: 'Submitted' });
  });
});
