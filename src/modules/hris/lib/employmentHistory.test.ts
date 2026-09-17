import { describe, expect, it } from 'vitest';
import {
  assignmentDays,
  assignmentsToCsv,
  buildRecentMovements,
  buildTimeline,
  computeServiceSummary,
  diffAssignment,
  isPromotion,
  rankChangesFromAudit,
  totalSeaDays,
  type AssignmentRecord,
  type ContractRecord,
} from './employmentHistory';

const TODAY = new Date(2026, 8, 17); // 17 Sep 2026

const assignment = (over: Partial<AssignmentRecord> & Pick<AssignmentRecord, 'id' | 'vessel_id' | 'join_date'>): AssignmentRecord => ({
  vessel_name: `MY ${over.vessel_id.toUpperCase()}`,
  position: 'Deckhand',
  rank: null,
  department: 'Deck',
  leave_date: null,
  is_current: !over.leave_date,
  end_reason: null,
  notes: null,
  ...over,
});

const contract = (over: Partial<ContractRecord> & Pick<ContractRecord, 'id' | 'start_date'>): ContractRecord => ({
  contract_type: 'rotational',
  contract_number: null,
  position: null,
  rank: null,
  vessel_id: null,
  vessel_name: null,
  end_date: null,
  probation_end_date: null,
  status: 'active',
  terminated_at: null,
  termination_reason: null,
  ...over,
});

describe('assignmentDays', () => {
  it('counts sign-on and sign-off days inclusively', () => {
    expect(assignmentDays({ join_date: '2026-01-01', leave_date: '2026-01-10' }, TODAY)).toBe(10);
  });

  it('runs to today while still on board', () => {
    expect(assignmentDays({ join_date: '2026-09-01', leave_date: null }, TODAY)).toBe(17);
  });

  it('caps a future leave date at today', () => {
    expect(assignmentDays({ join_date: '2026-09-10', leave_date: '2026-12-01' }, TODAY)).toBe(8);
  });

  it('is zero for future joins and bad dates', () => {
    expect(assignmentDays({ join_date: '2026-10-01', leave_date: null }, TODAY)).toBe(0);
    expect(assignmentDays({ join_date: 'nope', leave_date: null }, TODAY)).toBe(0);
  });
});

describe('totalSeaDays', () => {
  it('sums disjoint periods', () => {
    expect(
      totalSeaDays(
        [
          { join_date: '2026-01-01', leave_date: '2026-01-10' },
          { join_date: '2026-02-01', leave_date: '2026-02-05' },
        ],
        TODAY,
      ),
    ).toBe(15);
  });

  it('counts overlapping and adjacent periods once', () => {
    expect(
      totalSeaDays(
        [
          { join_date: '2026-01-01', leave_date: '2026-01-10' },
          { join_date: '2026-01-05', leave_date: '2026-01-20' },
          { join_date: '2026-01-21', leave_date: '2026-01-25' },
        ],
        TODAY,
      ),
    ).toBe(25);
  });
});

describe('computeServiceSummary', () => {
  const assignments = [
    assignment({ id: 'a1', vessel_id: 'alpha', join_date: '2025-01-01', leave_date: '2025-06-30', end_reason: 'contract_end' }),
    assignment({ id: 'a2', vessel_id: 'beta', join_date: '2026-01-01', leave_date: '2026-03-01', end_reason: 'transfer' }),
    assignment({ id: 'a3', vessel_id: 'alpha', join_date: '2026-03-01' }),
  ];

  it('derives tiles from assignments and the active contract', () => {
    const summary = computeServiceSummary(
      assignments,
      [
        contract({ id: 'c0', start_date: '2025-01-01', end_date: '2025-12-31', status: 'expired' }),
        contract({ id: 'c1', start_date: '2026-01-01', end_date: '2026-12-31', status: 'active' }),
      ],
      TODAY,
    );
    expect(summary.vesselsServed).toBe(2);
    expect(summary.firstJoinDate).toBe('2025-01-01');
    expect(summary.currentVesselName).toBe('MY ALPHA');
    expect(summary.currentVesselDays).toBe(assignmentDays(assignments[2], TODAY));
    // 181 (a1) + 260 (a2+a3 contiguous from 1 Jan to 17 Sep)
    expect(summary.totalSeaDays).toBe(181 + 260);
    expect(summary.currentContract).toMatchObject({ id: 'c1', lengthDays: 365, daysRemaining: 105 });
  });

  it('handles no assignments and no contract', () => {
    const summary = computeServiceSummary([], [], TODAY);
    expect(summary).toEqual({
      totalSeaDays: 0,
      vesselsServed: 0,
      currentVesselDays: null,
      currentVesselName: null,
      firstJoinDate: null,
      currentContract: null,
    });
  });
});

describe('buildTimeline', () => {
  it('merges assignments, contracts and rank changes newest first', () => {
    const events = buildTimeline({
      assignments: [
        assignment({ id: 'a1', vessel_id: 'alpha', join_date: '2025-01-01', leave_date: '2025-06-30', end_reason: 'contract_end', notes: 'Went home' }),
        assignment({ id: 'a2', vessel_id: 'beta', join_date: '2026-01-01' }),
      ],
      contracts: [
        contract({ id: 'c1', start_date: '2026-01-01', end_date: '2026-12-31', probation_end_date: '2026-04-01' }),
      ],
      rankChanges: [
        { id: 'r1', date: '2026-05-01T10:00:00Z', fromRank: 'Deckhand', toRank: 'Bosun', fromPosition: null, toPosition: null, actorEmail: 'hr@example.com' },
      ],
    });

    expect(events.map((e) => `${e.date}:${e.type}`)).toEqual([
      '2026-12-31:contract_ended',
      '2026-05-01:promoted',
      '2026-04-01:probation_ended',
      '2026-01-01:joined_vessel',
      '2026-01-01:contract_started',
      '2025-06-30:left_vessel',
      '2025-01-01:joined_vessel',
    ]);
    const left = events.find((e) => e.type === 'left_vessel');
    expect(left?.reason).toBe('Contract end');
    expect(left?.notes).toBe('Went home');
    expect(events.find((e) => e.type === 'promoted')?.title).toBe('Promoted to Bosun');
  });

  it('collapses a transfer into one event and drops the successor join', () => {
    const events = buildTimeline({
      assignments: [
        assignment({ id: 'a1', vessel_id: 'alpha', join_date: '2026-01-01', leave_date: '2026-03-01', end_reason: 'transfer', notes: 'Owner request' }),
        assignment({ id: 'a2', vessel_id: 'beta', join_date: '2026-03-01', position: 'Bosun' }),
      ],
      contracts: [],
      rankChanges: [],
    });
    expect(events.map((e) => e.type)).toEqual(['transferred', 'joined_vessel']);
    const transfer = events[0];
    expect(transfer.title).toBe('Transferred from MY ALPHA to MY BETA');
    expect(transfer.toVesselName).toBe('MY BETA');
    expect(transfer.position).toBe('Bosun');
    expect(transfer.notes).toBe('Owner request');
  });

  it('infers a transfer from back-to-back assignments without an end reason', () => {
    const events = buildTimeline({
      assignments: [
        assignment({ id: 'a1', vessel_id: 'alpha', join_date: '2026-01-01', leave_date: '2026-03-01' }),
        assignment({ id: 'a2', vessel_id: 'beta', join_date: '2026-03-02' }),
      ],
      contracts: [],
      rankChanges: [],
    });
    expect(events.map((e) => e.type)).toEqual(['transferred', 'joined_vessel']);
  });

  it('emits terminated and account_deactivated events', () => {
    const events = buildTimeline({
      assignments: [assignment({ id: 'a1', vessel_id: 'alpha', join_date: '2026-01-01', leave_date: '2026-02-01', end_reason: 'deactivated' })],
      contracts: [contract({ id: 'c1', start_date: '2026-01-01', status: 'terminated', terminated_at: '2026-02-01', termination_reason: 'Misconduct' })],
      rankChanges: [],
      deactivatedAt: '2026-02-01T09:00:00Z',
    });
    const types = events.map((e) => e.type);
    expect(types).toContain('terminated');
    expect(types.filter((t) => t === 'account_deactivated')).toHaveLength(1);
    expect(events.find((e) => e.type === 'terminated')?.reason).toBe('Misconduct');
  });

  it('classifies sideways moves as rank_changed', () => {
    const events = buildTimeline({
      assignments: [],
      contracts: [],
      rankChanges: [
        { id: 'r1', date: '2026-05-01', fromRank: 'Captain', toRank: 'Chief Officer', fromPosition: null, toPosition: null, actorEmail: null },
        { id: 'r2', date: '2026-05-02', fromRank: 'Captain', toRank: 'Captain', fromPosition: null, toPosition: null, actorEmail: null },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('rank_changed');
  });
});

describe('isPromotion', () => {
  it('uses the seniority ladder and is conservative about unknown ranks', () => {
    expect(isPromotion('Deckhand', 'Bosun')).toBe(true);
    expect(isPromotion('Bosun', 'Deckhand')).toBe(false);
    expect(isPromotion('Deckhand', 'Underwater basket weaver')).toBe(false);
    expect(isPromotion(null, 'Captain')).toBe(false);
  });
});

describe('rankChangesFromAudit', () => {
  it('keeps only rows where rank or position moved', () => {
    const rows = rankChangesFromAudit([
      { id: '1', timestamp: '2026-01-01T00:00:00Z', actor_email: 'a@b.c', old_values: { rank: 'Deckhand' }, new_values: { rank: 'Bosun' } },
      { id: '2', timestamp: '2026-01-02T00:00:00Z', actor_email: null, old_values: { phone: '1' }, new_values: { phone: '2' } },
      { id: '3', timestamp: '2026-01-03T00:00:00Z', actor_email: null, old_values: { position: 'Stew' }, new_values: { position: 'Chief Stew' } },
      { id: '4', timestamp: null, actor_email: null, old_values: { rank: 'a' }, new_values: { rank: 'b' } },
      { id: '5', timestamp: '2026-01-05T00:00:00Z', actor_email: null, old_values: 'garbage', new_values: null },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['1', '3']);
    expect(rows[0]).toMatchObject({ fromRank: 'Deckhand', toRank: 'Bosun', actorEmail: 'a@b.c' });
  });
});

describe('buildRecentMovements', () => {
  it('lists joins, leaves and transfers inside the window', () => {
    const rows = [
      { ...assignment({ id: 'a1', vessel_id: 'alpha', join_date: '2026-08-01', leave_date: '2026-09-10', end_reason: 'transfer' }), crewName: 'Ann Lee', profileId: 'p1' },
      { ...assignment({ id: 'a2', vessel_id: 'beta', join_date: '2026-09-10', position: 'Bosun' }), crewName: 'Ann Lee', profileId: 'p1' },
      { ...assignment({ id: 'a3', vessel_id: 'beta', join_date: '2026-09-15' }), crewName: 'Bob Roy', profileId: 'p2' },
      { ...assignment({ id: 'a4', vessel_id: 'alpha', join_date: '2026-01-01', leave_date: '2026-09-01', end_reason: 'resignation' }), crewName: 'Cy Diaz', profileId: 'p3' },
      { ...assignment({ id: 'a5', vessel_id: 'alpha', join_date: '2026-01-01', leave_date: '2026-07-01', end_reason: 'resignation' }), crewName: 'Old News', profileId: 'p4' },
    ];
    const moves = buildRecentMovements(rows, TODAY, 30);
    expect(moves.map((m) => `${m.date}:${m.kind}:${m.crewName}`)).toEqual([
      '2026-09-15:join:Bob Roy',
      '2026-09-10:transfer:Ann Lee',
      '2026-09-01:leave:Cy Diaz',
    ]);
    expect(moves[1].vesselName).toBe('MY ALPHA → MY BETA');
    expect(moves[1].position).toBe('Bosun');
    expect(moves[2].reason).toBe('Resignation');
  });
});

describe('assignmentsToCsv', () => {
  it('writes one row per assignment in chronological order with quoting', () => {
    const csv = assignmentsToCsv(
      [
        assignment({ id: 'a2', vessel_id: 'beta', join_date: '2026-01-01', rank: 'Bosun' }),
        assignment({ id: 'a1', vessel_id: 'alpha', join_date: '2025-01-01', leave_date: '2025-01-10', end_reason: 'contract_end', notes: 'Said "bye", left' }),
      ],
      TODAY,
    );
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Vessel,Position,Rank,From,To,Days,Reason,Notes');
    expect(lines[1]).toBe('MY ALPHA,Deckhand,,2025-01-01,2025-01-10,10,Contract end,"Said ""bye"", left"');
    expect(lines[2]).toBe('MY BETA,Deckhand,Bosun,2026-01-01,,260,,');
  });
});

describe('diffAssignment', () => {
  it('returns only the fields that changed, treating empty strings as null', () => {
    const current = assignment({ id: 'a1', vessel_id: 'alpha', join_date: '2026-01-01', leave_date: null, rank: 'Bosun', notes: null });
    const { changed, oldValues, newValues } = diffAssignment(current, {
      join_date: '2026-01-01',
      leave_date: '2026-02-01',
      rank: '',
      notes: 'Hello',
      position: 'Deckhand',
    });
    expect(changed).toEqual({ leave_date: '2026-02-01', rank: null, notes: 'Hello' });
    expect(oldValues).toEqual({ leave_date: null, rank: 'Bosun', notes: null });
    expect(newValues).toEqual({ leave_date: '2026-02-01', rank: null, notes: 'Hello' });
  });
});
