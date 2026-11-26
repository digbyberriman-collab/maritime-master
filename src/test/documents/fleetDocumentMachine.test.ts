/**
 * The fleet document lifecycle (src/modules/documents/lib/fleetDocumentMachine.ts;
 * gap/02 W1, FD4; D-X5-03, D-X5-04):
 *
 * - every cell of the states × actions table, legal and illegal, and the
 *   SQL test's copy of it (supabase/tests/sql/fleet/documents_library.test.sql,
 *   between the machine-table markers) is the same table;
 * - the publish guards in the server's order, supersession, the major /
 *   minor acknowledgement effect, version labels and numbers;
 * - the taxonomy delete rules;
 * - a sentence for every refusal the migration raises, and none for an
 *   unknown code.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLEET_DOCUMENT_ACTIONS,
  FLEET_DOCUMENT_ACTION_RPC,
  FLEET_DOCUMENT_MACHINE,
  FLEET_DOCUMENT_REFUSAL_CODES,
  FLEET_DOCUMENT_STATUSES,
  FLEET_DOCUMENT_VERSION_STATES,
  autoVersionLabel,
  fleetDocumentActions,
  fleetDocumentRefusal,
  fleetDocumentTransition,
  isFleetDocumentStatus,
  isFleetDocumentVersionState,
  nextVersionNo,
  publishAckEffect,
  publishRefusal,
  sectionDeleteRefusal,
  supersede,
  typeDeleteRefusal,
  type FleetDocumentAction,
  type FleetDocumentStatus,
  type PublishCheck,
} from '@/modules/documents/lib/fleetDocumentMachine';

const ROOT = process.cwd();
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261124040300_fleet_documents_library.sql'), 'utf8');
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/fleet/documents_library.test.sql'), 'utf8');

/** The cell as the SQL test writes it: the state it leads to, or '!' and the refusal. */
const cellText = (status: FleetDocumentStatus, action: FleetDocumentAction) => {
  const outcome = FLEET_DOCUMENT_MACHINE[status][action];
  return outcome.ok ? outcome.to : `!${outcome.refusal}`;
};

const EXPECTED: ReadonlyArray<[FleetDocumentStatus, FleetDocumentAction, string]> = [
  ['draft', 'edit_details', 'draft'],
  ['draft', 'add_version', 'draft'],
  ['draft', 'set_targets', 'draft'],
  ['draft', 'publish', 'published'],
  ['draft', 'withdraw', '!not_published'],
  ['draft', 'delete_draft', 'deleted'],
  ['published', 'edit_details', 'published'],
  ['published', 'add_version', 'published'],
  ['published', 'set_targets', 'published'],
  ['published', 'publish', 'published'],
  ['published', 'withdraw', 'withdrawn'],
  ['published', 'delete_draft', '!document_published'],
  ['withdrawn', 'edit_details', '!document_withdrawn'],
  ['withdrawn', 'add_version', '!document_withdrawn'],
  ['withdrawn', 'set_targets', '!document_withdrawn'],
  ['withdrawn', 'publish', '!document_withdrawn'],
  ['withdrawn', 'withdraw', '!already_withdrawn'],
  ['withdrawn', 'delete_draft', '!document_withdrawn'],
];

describe('the states × actions table', () => {
  it('has every state and action, and nothing else', () => {
    expect(FLEET_DOCUMENT_STATUSES).toEqual(['draft', 'published', 'withdrawn']);
    expect(FLEET_DOCUMENT_ACTIONS).toEqual(['edit_details', 'add_version', 'set_targets', 'publish', 'withdraw', 'delete_draft']);
    expect(Object.keys(FLEET_DOCUMENT_MACHINE)).toEqual([...FLEET_DOCUMENT_STATUSES]);
    for (const status of FLEET_DOCUMENT_STATUSES) expect(Object.keys(FLEET_DOCUMENT_MACHINE[status])).toEqual([...FLEET_DOCUMENT_ACTIONS]);
  });

  it.each(EXPECTED)('%s + %s -> %s', (status, action, outcome) => {
    expect(cellText(status, action)).toBe(outcome);
    expect(fleetDocumentTransition(status, action)).toBe(FLEET_DOCUMENT_MACHINE[status][action]);
  });

  it('a withdrawn document is final: no action is allowed', () => {
    expect(fleetDocumentActions('withdrawn')).toEqual([]);
    expect(fleetDocumentActions('draft')).toEqual(['edit_details', 'add_version', 'set_targets', 'publish', 'delete_draft']);
    expect(fleetDocumentActions('published')).toEqual(['edit_details', 'add_version', 'set_targets', 'publish', 'withdraw']);
  });

  it('only a draft is deleted; only a published document is withdrawn', () => {
    const deleting = FLEET_DOCUMENT_STATUSES.filter((s) => FLEET_DOCUMENT_MACHINE[s].delete_draft.ok);
    const withdrawing = FLEET_DOCUMENT_STATUSES.filter((s) => FLEET_DOCUMENT_MACHINE[s].withdraw.ok);
    expect(deleting).toEqual(['draft']);
    expect(withdrawing).toEqual(['published']);
  });

  it('the SQL test copies the table exactly (machine-table markers)', () => {
    const block = SQL_TEST.split('-- machine-table:start')[1]?.split('-- machine-table:end')[0] ?? '';
    const rows = Array.from(block.matchAll(/\('([a-z_]+)', '([a-z_]+)', '(!?[a-z_]+)'\)/g), (m) => [m[1], m[2], m[3]]);
    expect(rows).toEqual(EXPECTED.map((r) => [...r]));
  });

  it('each action has its definer in the migration, granted to the browser', () => {
    for (const action of FLEET_DOCUMENT_ACTIONS) {
      const rpc = FLEET_DOCUMENT_ACTION_RPC[action];
      expect(SQL, rpc).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\(`));
      expect(SQL, rpc).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([^)]*\\) TO authenticated;`));
    }
  });

  it('the vocabularies match the SQL CHECKs', () => {
    expect(SQL).toContain("CHECK (status IN ('draft', 'published', 'withdrawn'))");
    expect(SQL).toContain("CHECK (state IN ('draft', 'published', 'superseded'))");
    expect(FLEET_DOCUMENT_VERSION_STATES).toEqual(['draft', 'published', 'superseded']);
    expect(isFleetDocumentStatus('published')).toBe(true);
    expect(isFleetDocumentStatus('superseded')).toBe(false);
    expect(isFleetDocumentVersionState('superseded')).toBe(true);
    expect(isFleetDocumentVersionState('withdrawn')).toBe(false);
  });
});

describe('publish guards (the server order)', () => {
  const base: PublishCheck = {
    status: 'draft',
    expectedUpdatedAt: '2026-11-20T10:00:00.000Z',
    currentUpdatedAt: '2026-11-20T10:00:00+00:00',
    version: { state: 'draft', fileLive: true },
    targetMode: 'selected',
    liveTargetCount: 1,
  };

  it('a draft with a live file and a target publishes; so does a published document with a new draft version', () => {
    expect(publishRefusal(base)).toBeNull();
    expect(publishRefusal({ ...base, status: 'published' })).toBeNull();
    expect(publishRefusal({ ...base, targetMode: 'all_including_future', liveTargetCount: 0 })).toBeNull();
  });

  it.each<[string, Partial<PublishCheck>, string]>([
    ['withdrawn', { status: 'withdrawn' }, 'document_withdrawn'],
    ['no updated_at sent', { expectedUpdatedAt: null }, 'expected_updated_at_required'],
    ['a stale updated_at', { expectedUpdatedAt: '2026-11-20T09:59:59Z' }, 'stale_document'],
    ['not this document’s version', { version: null }, 'version_not_found'],
    ['the published version again', { version: { state: 'published', fileLive: true } }, 'version_already_published'],
    ['a superseded version', { version: { state: 'superseded', fileLive: true } }, 'version_superseded'],
    ['a removed file', { version: { state: 'draft', fileLive: false } }, 'file_missing'],
    ['selected with no live target', { liveTargetCount: 0 }, 'targets_required'],
  ])('%s is refused', (_, change, refusal) => {
    expect(publishRefusal({ ...base, ...change })).toBe(refusal);
  });

  it('checks in the server order (withdrawn first, targets last)', () => {
    expect(publishRefusal({ ...base, status: 'withdrawn', expectedUpdatedAt: null, version: null, liveTargetCount: 0 })).toBe('document_withdrawn');
    expect(publishRefusal({ ...base, expectedUpdatedAt: 'x', version: null })).toBe('stale_document');
    expect(publishRefusal({ ...base, version: { state: 'draft', fileLive: false }, liveTargetCount: 0 })).toBe('file_missing');
  });
});

describe('supersession and the acknowledgement effect', () => {
  it('the new version is published and the one before it superseded; the rest keep their state', () => {
    const versions = [
      { id: 'v1', state: 'superseded' as const },
      { id: 'v2', state: 'published' as const },
      { id: 'v3', state: 'draft' as const },
    ];
    const { versions: next, supersededId } = supersede(versions, 'v3');
    expect(next.map((v) => [v.id, v.state])).toEqual([
      ['v1', 'superseded'],
      ['v2', 'superseded'],
      ['v3', 'published'],
    ]);
    expect(supersededId).toBe('v2');
    expect(versions[1].state).toBe('published');
    expect(supersede([{ id: 'v1', state: 'draft' as const }], 'v1').supersededId).toBeNull();
    expect(() => supersede(versions, 'v2')).toThrow(/draft/);
    expect(() => supersede(versions, 'nope')).toThrow();
  });

  it('none without acknowledgement, fresh for the first version, carry forward for minor, reset for major', () => {
    expect(publishAckEffect({ ackRequired: false, hasPreviousVersion: true, versionKind: 'major' })).toBe('none');
    expect(publishAckEffect({ ackRequired: true, hasPreviousVersion: false, versionKind: 'minor' })).toBe('fresh');
    expect(publishAckEffect({ ackRequired: true, hasPreviousVersion: true, versionKind: 'minor' })).toBe('carry_forward');
    expect(publishAckEffect({ ackRequired: true, hasPreviousVersion: true, versionKind: 'major' })).toBe('reset');
    expect(SQL).toMatch(/WHEN NOT d\.ack_required THEN 'none'\s+WHEN v_superseded IS NULL THEN 'fresh'\s+WHEN v\.version_kind = 'minor' THEN 'carry_forward'\s+ELSE 'reset'/);
  });

  it('labels a blank version v<number>, numbering one past the highest', () => {
    expect(autoVersionLabel(3)).toBe('v3');
    expect(nextVersionNo([])).toBe(1);
    expect(nextVersionNo([{ version_no: 1 }, { version_no: 4 }, { version_no: 2 }])).toBe(5);
    expect(SQL).toContain("coalesce(v_label, 'v' || v_no)");
  });
});

describe('taxonomy delete rules (W1)', () => {
  it('a section or a type is deleted only while it holds no document', () => {
    expect(sectionDeleteRefusal(0)).toBeNull();
    expect(sectionDeleteRefusal(1)).toBe('section_in_use');
    expect(typeDeleteRefusal(0)).toBeNull();
    expect(typeDeleteRefusal(3)).toBe('type_in_use');
  });
});

describe('refusal sentences', () => {
  const raised = new Set(Array.from(SQL.matchAll(/MESSAGE = '([a-z_]+)'/g), (m) => m[1]));

  it('every message the definers raise has a sentence (guard messages are server-side only)', () => {
    const definerMessages = [...raised].filter((m) => !m.endsWith('_guarded'));
    expect(definerMessages.length).toBeGreaterThan(30);
    for (const message of definerMessages) expect(fleetDocumentRefusal(message), message).toMatch(/\.$/);
  });

  it('lists only codes the migration raises', () => {
    for (const code of FLEET_DOCUMENT_REFUSAL_CODES) expect(raised.has(code), code).toBe(true);
  });

  it('an unknown or empty code has no sentence', () => {
    expect(fleetDocumentRefusal('something_else')).toBeNull();
    expect(fleetDocumentRefusal('')).toBeNull();
    expect(fleetDocumentRefusal(null)).toBeNull();
    expect(fleetDocumentRefusal('toString')).toBeNull();
  });

  it('the sentences are plain and never promise an email or a notification', () => {
    for (const code of FLEET_DOCUMENT_REFUSAL_CODES) {
      const sentence = fleetDocumentRefusal(code) as string;
      expect(sentence, code).not.toMatch(/email|notif|_/i);
    }
  });
});
