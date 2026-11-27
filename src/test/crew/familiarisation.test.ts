/**
 * Familiarisation rules (X1-10; gap/04 W11): the status machine, overdue,
 * what each state allows, who may act, the sections rule, the legacy
 * mapping and the presets. The SQL test (supabase/tests/sql/crew/
 * familiarisation.test.sql) loads this very file and compares each rule
 * with its SQL mirror case by case; these tests pin the rules themselves.
 */
import { describe, expect, it } from 'vitest';
import {
  FAMILIARISATION_ACTIONS,
  FAMILIARISATION_PRESETS,
  FAMILIARISATION_REFUSALS,
  FAMILIARISATION_STATUSES,
  actionHint,
  addDaysDateOnly,
  checkAction,
  checklistItemsFromSections,
  daysUntil,
  decideActor,
  decideStatus,
  groupBySection,
  isFamiliarisationStatus,
  isOverdue,
  mapLegacyStatus,
  normaliseSections,
  progressPercent,
  sectionItemCount,
  trimText,
} from '@/modules/crew/lib/familiarisation';

const TF = [true, false] as const;

describe('decideStatus (open -> in progress -> awaiting signatures -> completed)', () => {
  it('nothing ticked, or no items, is open', () => {
    for (const total of [0, 1, 5]) for (const a of TF) for (const b of TF) for (const c of TF) for (const d of TF) {
      expect(decideStatus(total, 0, a, b, c, d)).toBe('open');
    }
    expect(decideStatus(0, 3, true, true, true, true)).toBe('open');
    expect(decideStatus(null, null, null, null, null, null)).toBe('open');
  });

  it('some ticked is in progress, whatever the signatures', () => {
    for (const a of TF) for (const b of TF) for (const c of TF) for (const d of TF) {
      expect(decideStatus(3, 1, a, b, c, d)).toBe('in_progress');
      expect(decideStatus(3, 2, a, b, c, d)).toBe('in_progress');
    }
  });

  it('every item ticked waits for each required signature', () => {
    expect(decideStatus(2, 2, true, false, true, false)).toBe('awaiting_signatures');
    expect(decideStatus(2, 2, true, true, true, false)).toBe('awaiting_signatures');
    expect(decideStatus(2, 2, true, false, true, true)).toBe('awaiting_signatures');
    expect(decideStatus(2, 2, false, false, true, false)).toBe('awaiting_signatures');
    expect(decideStatus(2, 2, true, false, false, false)).toBe('awaiting_signatures');
  });

  it('completes on the required signatures only', () => {
    expect(decideStatus(2, 2, true, true, true, true)).toBe('completed');
    expect(decideStatus(2, 2, false, false, true, true)).toBe('completed');
    expect(decideStatus(2, 2, true, true, false, false)).toBe('completed');
    expect(decideStatus(2, 2, false, false, false, false)).toBe('completed');
  });

  it('a missing flag means required', () => {
    expect(decideStatus(2, 2, null, null, null, null)).toBe('awaiting_signatures');
    expect(decideStatus(2, 2, null, true, null, true)).toBe('completed');
  });

  it('more ticks than items reads as all ticked', () => {
    expect(decideStatus(2, 3, false, false, false, false)).toBe('completed');
  });

  it('only answers the four statuses', () => {
    for (let t = 0; t <= 3; t += 1) for (let d = 0; d <= t + 1; d += 1) for (const a of TF) for (const b of TF) for (const c of TF) for (const e of TF) {
      expect(FAMILIARISATION_STATUSES).toContain(decideStatus(t, d, a, b, c, e));
    }
  });
});

describe('isOverdue (computed, never stored)', () => {
  const today = '2026-03-05';
  it('past due and not completed', () => {
    for (const s of ['open', 'in_progress', 'awaiting_signatures']) {
      expect(isOverdue(s, '2026-03-04', today)).toBe(true);
      expect(isOverdue(s, '2026-03-05', today)).toBe(false);
      expect(isOverdue(s, '2026-03-06', today)).toBe(false);
    }
  });
  it('never when completed, without a due date or a today', () => {
    expect(isOverdue('completed', '2026-01-01', today)).toBe(false);
    expect(isOverdue('open', null, today)).toBe(false);
    expect(isOverdue('open', '2026-01-01', null)).toBe(false);
    expect(isOverdue(null, '2026-01-01', today)).toBe(true);
  });
});

describe('checkAction (what a record state allows)', () => {
  it('ticks: not on a completed or signed record', () => {
    expect(checkAction('tick', 'open', 0, false, false, true, true)).toBe('ok');
    expect(checkAction('tick', 'in_progress', 1, false, false, true, true)).toBe('ok');
    expect(checkAction('tick', 'awaiting_signatures', 2, false, false, true, true)).toBe('ok');
    expect(checkAction('tick', 'awaiting_signatures', 2, true, false, true, true)).toBe('record_signed');
    expect(checkAction('tick', 'awaiting_signatures', 2, false, true, true, true)).toBe('record_signed');
    expect(checkAction('tick', 'completed', 2, true, true, true, true)).toBe('record_completed');
  });

  it('signatures: only once every item is ticked, once each, when required', () => {
    for (const [action, crew] of [['sign_crew', true], ['sign_supervisor', false]] as const) {
      const signed = (yes: boolean) => (crew ? [yes, false] : [false, yes]) as [boolean, boolean];
      expect(checkAction(action, 'awaiting_signatures', 2, ...signed(false), true, true)).toBe('ok');
      expect(checkAction(action, 'awaiting_signatures', 2, ...signed(true), true, true)).toBe('already_signed');
      expect(checkAction(action, 'open', 0, ...signed(false), true, true)).toBe('items_open');
      expect(checkAction(action, 'in_progress', 1, ...signed(false), true, true)).toBe('items_open');
      expect(checkAction(action, 'completed', 2, ...signed(true), true, true)).toBe('record_completed');
      expect(checkAction(action, 'awaiting_signatures', 2, false, false, !crew, crew)).toBe('signature_not_required');
    }
  });

  it('reopen: a completed record, or one with a signature', () => {
    expect(checkAction('reopen', 'completed', 2, true, true, true, true)).toBe('ok');
    expect(checkAction('reopen', 'awaiting_signatures', 2, true, false, true, true)).toBe('ok');
    expect(checkAction('reopen', 'awaiting_signatures', 2, false, true, true, true)).toBe('ok');
    expect(checkAction('reopen', 'awaiting_signatures', 2, false, false, true, true)).toBe('not_reopenable');
    expect(checkAction('reopen', 'in_progress', 1, false, false, true, true)).toBe('not_reopenable');
    expect(checkAction('reopen', 'open', 0, false, false, true, true)).toBe('not_reopenable');
  });

  it('delete: only open with nothing ticked and no signature', () => {
    expect(checkAction('delete', 'open', 0, false, false, true, true)).toBe('ok');
    expect(checkAction('delete', 'open', 1, false, false, true, true)).toBe('not_deletable');
    expect(checkAction('delete', 'open', 0, true, false, true, true)).toBe('not_deletable');
    for (const s of ['in_progress', 'awaiting_signatures', 'completed']) expect(checkAction('delete', s, 0, false, false, true, true)).toBe('not_deletable');
  });

  it('an unknown action is refused', () => {
    expect(checkAction('approve', 'open', 0, false, false, true, true)).toBe('action_unknown');
  });

  it('every action and state answers a refusal code with a sentence', () => {
    for (const a of FAMILIARISATION_ACTIONS) for (const s of [...FAMILIARISATION_STATUSES, null]) for (const d of [0, 1]) for (const x of TF) for (const y of TF) {
      const code = checkAction(a, s, d, x, y, true, true);
      if (code !== 'ok') expect(FAMILIARISATION_REFUSALS[code]).toBeTruthy();
    }
  });
});

describe('decideActor (who may act)', () => {
  it('ticks: an editor, or the person on their own record', () => {
    expect(decideActor('tick', false, true, false, true, false, null)).toBe('ok');
    expect(decideActor('tick', true, true, true, false, false, null)).toBe('ok');
    expect(decideActor('tick', true, true, false, false, false, null)).toBe('not_permitted');
    expect(decideActor('tick', false, true, true, false, true, 'ok')).toBe('not_permitted');
  });

  it('the crew signature: the person, with a login and view_own', () => {
    expect(decideActor('sign_crew', true, true, true, false, false, null)).toBe('ok');
    expect(decideActor('sign_crew', true, false, true, false, false, null)).toBe('no_login');
    expect(decideActor('sign_crew', true, true, false, false, false, null)).toBe('not_permitted');
    expect(decideActor('sign_crew', false, true, true, true, true, 'ok')).toBe('not_permitted');
  });

  it("the supervisor signature and reopen: the supervisor scope, never on one's own record", () => {
    for (const action of ['sign_supervisor', 'reopen']) {
      expect(decideActor(action, false, true, false, false, false, 'ok')).toBe('ok');
      expect(decideActor(action, false, true, false, true, true, 'out_of_department')).toBe('out_of_department');
      expect(decideActor(action, false, true, false, true, true, 'own_record')).toBe('own_record');
      expect(decideActor(action, false, true, false, true, true, 'not_permitted')).toBe('not_permitted');
      expect(decideActor(action, false, true, false, true, true, null)).toBe('not_permitted');
      expect(decideActor(action, true, true, true, true, true, 'ok')).toBe('own_record');
    }
  });

  it('delete: create', () => {
    expect(decideActor('delete', false, true, false, false, true, null)).toBe('ok');
    expect(decideActor('delete', true, true, true, true, false, 'ok')).toBe('not_permitted');
  });

  it('anything else is refused', () => {
    expect(decideActor('bogus', true, true, true, true, true, 'ok')).toBe('not_permitted');
  });
});

describe('normaliseSections (familiarisation_sections_normalise)', () => {
  it('trims, keeps order and optional days', () => {
    expect(normaliseSections([{ section_name: '  Deck  ', checklist_items: ['  one ', 'two'], required_days: 3 }, { section_name: 'B', checklist_items: ['x'] }])).toEqual({
      ok: true,
      sections: [
        { section_name: 'Deck', checklist_items: ['one', 'two'], required_days: 3 },
        { section_name: 'B', checklist_items: ['x'] },
      ],
    });
  });
  it.each([
    [null, 'sections_required', null],
    [[], 'sections_required', null],
    ['x', 'sections_required', null],
    [Array.from({ length: 31 }, (_, i) => ({ section_name: `S${i}`, checklist_items: ['a'] })), 'too_many_sections', null],
    [[1], 'section_invalid', 1],
    [[{ section_name: '', checklist_items: ['a'] }], 'section_name_required', 1],
    [[{ section_name: 5, checklist_items: ['a'] }], 'section_name_required', 1],
    [[{ section_name: 'x'.repeat(121), checklist_items: ['a'] }], 'section_name_too_long', 1],
    [[{ section_name: 'A', checklist_items: ['a'] }, { section_name: 'a', checklist_items: ['b'] }], 'section_duplicate', 2],
    [[{ section_name: 'A', checklist_items: [] }], 'section_items_required', 1],
    [[{ section_name: 'A', checklist_items: Array.from({ length: 61 }, (_, i) => `i${i}`) }], 'too_many_items', 1],
    [[{ section_name: 'A', checklist_items: [''] }], 'item_invalid', 1],
    [[{ section_name: 'A', checklist_items: [3] }], 'item_invalid', 1],
    [[{ section_name: 'A', checklist_items: ['y'.repeat(301)] }], 'item_invalid', 1],
    [[{ section_name: 'A', checklist_items: ['a'], required_days: 1.5 }], 'section_days_invalid', 1],
    [[{ section_name: 'A', checklist_items: ['a'], required_days: -1 }], 'section_days_invalid', 1],
    [[{ section_name: 'A', checklist_items: ['a'], required_days: 366 }], 'section_days_invalid', 1],
  ])('refuses %j with %s', (input, problem, section) => {
    expect(normaliseSections(input)).toEqual({ ok: false, problem, section });
  });
  it('accepts the limits', () => {
    expect(normaliseSections([{ section_name: 'A', checklist_items: ['y'.repeat(300)], required_days: null }]).ok).toBe(true);
    expect(normaliseSections([{ section_name: 'x'.repeat(120), checklist_items: Array.from({ length: 60 }, (_, i) => `i${i}`) }]).ok).toBe(true);
  });
  it('trims ASCII whitespace the way the SQL btrim does', () => {
    expect(trimText('\t Tabbed \n')).toBe('Tabbed');
    expect(normaliseSections([{ section_name: '\t Tabbed \n', checklist_items: ['\tx\n'] }])).toEqual({ ok: true, sections: [{ section_name: 'Tabbed', checklist_items: ['x'] }] });
  });
});

describe('checklistItemsFromSections (the C63 fix: the chosen template, not the default sections)', () => {
  it('numbers the items section by section', () => {
    expect(checklistItemsFromSections([{ section_name: 'A', checklist_items: ['one', 'two'] }, { section_name: 'B', checklist_items: ['three'] }])).toEqual([
      { section_name: 'A', item_text: 'one', item_order: 1001 },
      { section_name: 'A', item_text: 'two', item_order: 1002 },
      { section_name: 'B', item_text: 'three', item_order: 2001 },
    ]);
  });
  it('reads legacy rows leniently', () => {
    expect(checklistItemsFromSections([{ section_name: '', checklist_items: ['x', 4, ' '] }, null, { section_name: 'B' }])).toEqual([
      { section_name: 'Checklist', item_text: 'x', item_order: 1001 },
    ]);
    expect(checklistItemsFromSections('nope')).toEqual([]);
  });
  it('counts items', () => {
    expect(sectionItemCount([{ checklist_items: ['a', 'b'] }, { checklist_items: ['c'] }, {}])).toBe(3);
    expect(sectionItemCount(null)).toBe(0);
  });
});

describe('the helpers', () => {
  it('maps the legacy statuses as the record guard does', () => {
    expect(mapLegacyStatus('Not_Started')).toBe('open');
    expect(mapLegacyStatus('In_Progress')).toBe('in_progress');
    expect(mapLegacyStatus('Overdue')).toBe('in_progress');
    expect(mapLegacyStatus('Completed')).toBe('completed');
    expect(mapLegacyStatus('')).toBe('open');
    expect(mapLegacyStatus(null)).toBe('open');
    expect(mapLegacyStatus('awaiting_signatures')).toBe('awaiting_signatures');
  });
  it('recognises the statuses', () => {
    for (const s of FAMILIARISATION_STATUSES) expect(isFamiliarisationStatus(s)).toBe(true);
    expect(isFamiliarisationStatus('Completed')).toBe(false);
  });
  it('groups items by section in order', () => {
    const g = groupBySection([
      { section_name: 'B', item_order: 2001 },
      { section_name: 'A', item_order: 1002 },
      { section_name: 'A', item_order: 1001 },
    ]);
    expect(g.map((x) => [x.name, x.items.map((i) => i.item_order)])).toEqual([['A', [1001, 1002]], ['B', [2001]]]);
  });
  it('computes progress and dates', () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(5, 3)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
    expect(addDaysDateOnly('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysUntil('2026-03-01', '2026-03-05')).toBe(-4);
    expect(daysUntil('2026-03-08', '2026-03-05')).toBe(3);
  });
  it('explains a disabled action', () => {
    expect(actionHint('ok')).toBeNull();
    expect(actionHint('out_of_department')).toBe(FAMILIARISATION_REFUSALS.out_of_department);
    expect(actionHint('something_new')).toBe(FAMILIARISATION_REFUSALS.not_permitted);
  });
});

describe('the STORM presets (T-15)', () => {
  it('a 24-hour and a two-week familiarisation, each valid as template sections', () => {
    expect(FAMILIARISATION_PRESETS.map((p) => [p.key, p.dueWithinDays])).toEqual([['arrival_24h', 1], ['vessel_two_weeks', 14]]);
    for (const p of FAMILIARISATION_PRESETS) {
      const r = normaliseSections(p.sections);
      expect(r.ok).toBe(true);
      expect(p.name.length).toBeLessThanOrEqual(120);
      expect(p.description.length).toBeLessThanOrEqual(2000);
    }
  });
});
