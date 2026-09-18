import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REQUEST_FILTERS,
  emptyIntakeValues,
  filterRequests,
  formatBytes,
  intakeToInsert,
  isUrgentRequest,
  nextStatus,
  parseAttachments,
  parseTags,
  requestAgeDays,
  sortRequests,
  statusIndex,
  validateIntake,
  validateIntakeStep,
  type LegalRequestRow,
} from './requests';

const row = (overrides: Partial<LegalRequestRow> = {}): LegalRequestRow => ({
  id: overrides.id ?? 'r1',
  reference_number: 'LEG-2026-001',
  company_id: 'co',
  submitted_by: 'u1',
  request_type: 'nda',
  priority: 'medium',
  status: 'submitted',
  risk_level: 'medium',
  title: 'NDA with Acme Yachts',
  description: null,
  counterparty: 'Acme Yachts',
  contract_value: null,
  currency: 'USD',
  jurisdiction: null,
  requested_deadline: null,
  sla_deadline: '2026-09-23T10:00:00.000Z',
  assigned_to: null,
  requester_department: 'Deck',
  vessel_id: null,
  incident_id: null,
  cfm_employee_id: null,
  profile_id: null,
  tags: [],
  attachments: [],
  resolution_summary: null,
  resolved_at: null,
  source_id: null,
  created_at: '2026-09-16T10:00:00.000Z',
  updated_at: '2026-09-16T10:00:00.000Z',
  ...overrides,
});

describe('attachments', () => {
  it('parses only well-formed entries', () => {
    const parsed = parseAttachments([{ path: 'a/b.pdf', name: 'b.pdf', size: 12 }, { name: 'no path' }, 'junk', null]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ path: 'a/b.pdf', mime_type: 'application/octet-stream', uploaded_by: null });
    expect(parseAttachments('nope')).toEqual([]);
  });

  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB');
  });
});

describe('status helpers', () => {
  it('walks the workflow', () => {
    expect(statusIndex('submitted')).toBe(0);
    expect(statusIndex('cancelled')).toBe(-1);
    expect(nextStatus('submitted')).toBe('triaged');
    expect(nextStatus('under_review')).toBe('completed');
    expect(nextStatus('completed')).toBeNull();
    expect(nextStatus('cancelled')).toBeNull();
  });

  it('flags urgent open requests only', () => {
    expect(isUrgentRequest(row({ priority: 'urgent' }))).toBe(true);
    expect(isUrgentRequest(row({ risk_level: 'high' }))).toBe(true);
    expect(isUrgentRequest(row({ priority: 'high', status: 'completed' }))).toBe(false);
    expect(isUrgentRequest(row())).toBe(false);
  });

  it('computes age in whole days', () => {
    expect(requestAgeDays('2026-09-10T10:00:00.000Z', new Date('2026-09-16T09:00:00.000Z'))).toBe(5);
    expect(requestAgeDays('garbage')).toBe(0);
  });
});

describe('filterRequests', () => {
  const rows = [
    row({ id: 'a', title: 'NDA with Acme', status: 'submitted', priority: 'urgent' }),
    row({ id: 'b', title: 'Charter contract', status: 'completed', counterparty: 'Blue Water', risk_level: 'high' }),
    row({ id: 'c', title: 'Visa question', status: 'in_progress', assigned_to: 'legal-1', submitted_by: 'u2', reference_number: 'LEG-2026-003' }),
  ];

  it('defaults to open requests', () => {
    expect(filterRequests(rows, DEFAULT_REQUEST_FILTERS).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('searches title, reference and counterparty', () => {
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, status: 'all', search: 'blue water' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, status: 'all', search: '003' }).map((r) => r.id)).toEqual(['c']);
  });

  it('filters by status, priority, risk, assignee and mine', () => {
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, status: 'completed' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, priority: 'urgent' }).map((r) => r.id)).toEqual(['a']);
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, status: 'all', risk: 'high' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, assignee: 'unassigned' }).map((r) => r.id)).toEqual(['a']);
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, assignee: 'me' }, 'legal-1').map((r) => r.id)).toEqual(['c']);
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, assignee: 'legal-1' }).map((r) => r.id)).toEqual(['c']);
    expect(filterRequests(rows, { ...DEFAULT_REQUEST_FILTERS, mine: true }, 'u2').map((r) => r.id)).toEqual(['c']);
  });
});

describe('sortRequests', () => {
  it('puts open requests first by SLA, then closed by resolution', () => {
    const sorted = sortRequests([
      row({ id: 'closed-old', status: 'completed', resolved_at: '2026-09-01T00:00:00.000Z' }),
      row({ id: 'late', sla_deadline: '2026-09-30T00:00:00.000Z' }),
      row({ id: 'soon', sla_deadline: '2026-09-17T00:00:00.000Z' }),
      row({ id: 'closed-new', status: 'completed', resolved_at: '2026-09-15T00:00:00.000Z' }),
      row({ id: 'no-sla', sla_deadline: null }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['soon', 'late', 'no-sla', 'closed-new', 'closed-old']);
  });
});

describe('intake', () => {
  it('requires a type and a title', () => {
    const { ok, errors } = validateIntake(emptyIntakeValues());
    expect(ok).toBe(false);
    expect(errors.request_type).toBe('Choose a request type');
    expect(errors.title).toBeDefined();
    expect(validateIntakeStep(emptyIntakeValues(), 'type')).toEqual({ request_type: 'Choose a request type' });
    expect(validateIntakeStep(emptyIntakeValues({ request_type: 'nda' }), 'type')).toEqual({});
  });

  it('validates numbers and dates', () => {
    const values = emptyIntakeValues({ request_type: 'contract_review', title: 'Charter', contract_value: 'lots', requested_deadline: '2026-13-40' });
    const { errors } = validateIntake(values);
    expect(errors.contract_value).toBe('Enter the value as a number');
    expect(errors.requested_deadline).toBe('Enter a valid date');
    expect(validateIntake({ ...values, contract_value: '1200.50', requested_deadline: '2026-10-01' }).ok).toBe(true);
  });

  it('builds an insert payload that respects the conditional fields', () => {
    const nda = intakeToInsert(
      emptyIntakeValues({ request_type: 'nda', title: ' NDA ', counterparty: 'Acme', contract_value: '500', currency: 'eur', tags: [' crew ', ''] }),
      'u1',
      'co',
    );
    expect(nda).toMatchObject({ submitted_by: 'u1', company_id: 'co', title: 'NDA', counterparty: 'Acme', contract_value: null, currency: 'USD', tags: ['crew'], status: 'submitted' });

    const contract = intakeToInsert(
      emptyIntakeValues({ request_type: 'contract_review', title: 'Charter', counterparty: 'Blue', contract_value: '500', currency: 'eur', vessel_id: 'v1' }),
      'u1',
      'co',
    );
    expect(contract).toMatchObject({ counterparty: 'Blue', contract_value: 500, currency: 'EUR', vessel_id: 'v1' });

    const employment = intakeToInsert(emptyIntakeValues({ request_type: 'employment', title: 'SEA', counterparty: 'Should drop' }), 'u1', 'co');
    expect(employment.counterparty).toBeNull();
  });

  it('parses tags', () => {
    expect(parseTags('charter, Charter ,urgent\nfleet', ['Fleet'])).toEqual(['Fleet', 'charter', 'urgent']);
  });
});
