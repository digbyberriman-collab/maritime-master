import { describe, expect, it } from 'vitest';
import { computeDashboardMetrics, monthlyVolume, recentActivity, statusBreakdown, urgentAttention } from './dashboard';
import type { LegalRequestRow } from './requests';

const row = (overrides: Partial<LegalRequestRow> = {}): LegalRequestRow => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  reference_number: 'LEG-2026-001',
  company_id: 'co',
  submitted_by: 'u1',
  request_type: 'nda',
  priority: 'medium',
  status: 'submitted',
  risk_level: 'medium',
  title: 'x',
  description: null,
  counterparty: null,
  contract_value: null,
  currency: 'USD',
  jurisdiction: null,
  requested_deadline: null,
  sla_deadline: null,
  assigned_to: null,
  requester_department: null,
  vessel_id: null,
  incident_id: null,
  cfm_employee_id: null,
  profile_id: null,
  tags: [],
  attachments: [],
  resolution_summary: null,
  resolved_at: null,
  source_id: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const NOW = new Date('2026-09-16T12:00:00.000Z');

describe('computeDashboardMetrics', () => {
  it('returns safe defaults on an empty list', () => {
    expect(computeDashboardMetrics([], NOW)).toEqual({ open: 0, urgent: 0, completed: 0, avgCycleDays: null, slaCompliancePct: 100, breached: 0 });
  });

  it('counts open, urgent, cycle time, SLA compliance and breaches', () => {
    const rows = [
      row({ status: 'submitted', priority: 'urgent', sla_deadline: '2026-09-15T00:00:00.000Z' }), // open, urgent, breached
      row({ status: 'in_progress', risk_level: 'high', sla_deadline: '2026-09-20T00:00:00.000Z' }), // open, urgent
      row({ status: 'triaged' }), // open
      row({ status: 'completed', created_at: '2026-09-01T00:00:00.000Z', resolved_at: '2026-09-03T00:00:00.000Z', sla_deadline: '2026-09-05T00:00:00.000Z' }), // 2 d, on time
      row({ status: 'completed', created_at: '2026-09-01T00:00:00.000Z', resolved_at: '2026-09-05T00:00:00.000Z', sla_deadline: '2026-09-04T00:00:00.000Z' }), // 4 d, late
      row({ status: 'completed', created_at: '2026-09-01T00:00:00.000Z', resolved_at: '2026-09-02T00:00:00.000Z', sla_deadline: null }), // 1 d, no SLA
      row({ status: 'cancelled', priority: 'urgent' }),
    ];
    const m = computeDashboardMetrics(rows, NOW);
    expect(m.open).toBe(3);
    expect(m.urgent).toBe(2);
    expect(m.completed).toBe(3);
    expect(m.avgCycleDays).toBe(2.3);
    expect(m.slaCompliancePct).toBe(50);
    expect(m.breached).toBe(1);
  });
});

describe('breakdowns', () => {
  it('drops empty status slices and colours the rest from tokens', () => {
    const slices = statusBreakdown([row({ status: 'submitted' }), row({ status: 'submitted' }), row({ status: 'completed' })]);
    expect(slices.map((s) => [s.label, s.count])).toEqual([
      ['Submitted', 2],
      ['Completed', 1],
    ]);
    expect(slices[0].color).toContain('hsl(var(--');
  });

  it('buckets the trailing six months oldest first', () => {
    const buckets = monthlyVolume(
      [row({ created_at: '2026-09-02T00:00:00.000Z' }), row({ created_at: '2026-07-20T00:00:00.000Z' }), row({ created_at: '2025-09-20T00:00:00.000Z' })],
      new Date(2026, 8, 16),
    );
    expect(buckets.map((b) => b.label)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
    expect(buckets.map((b) => b.count)).toEqual([0, 0, 0, 1, 0, 1]);
  });

  it('lists urgent attention most pressing first and recent activity by update', () => {
    const a = row({ id: 'a', priority: 'urgent', sla_deadline: '2026-09-18T00:00:00.000Z', updated_at: '2026-09-10T00:00:00.000Z' });
    const b = row({ id: 'b', sla_deadline: '2026-09-10T00:00:00.000Z', updated_at: '2026-09-15T00:00:00.000Z' }); // breached
    const c = row({ id: 'c', status: 'completed', priority: 'urgent', updated_at: '2026-09-16T00:00:00.000Z' });
    const d = row({ id: 'd', sla_deadline: '2026-09-30T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' });
    expect(urgentAttention([a, b, c, d], NOW).map((r) => r.id)).toEqual(['b', 'a']);
    expect(recentActivity([a, b, c, d], 3).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});
