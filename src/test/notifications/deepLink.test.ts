/**
 * The inbox deep-link resolver (gap/03 C11; gap/08 NO3; gap/10 IA15; D-97,
 * D-111; Phase 2 spec §B.7, CC-22): every scope × reach × path shape, upper
 * and lower vessel codes, query and hash kept, unsafe paths refused, record
 * kinds through the registry's route patterns (vessel, fleet and
 * workspace-scoped), and nothing ever resolves outside its scope root.
 */
import { describe, expect, it } from 'vitest';
import {
  DEEP_LINK_UNAVAILABLE_DETAIL,
  FLEET_HOME,
  WORKSPACE_ROOTS,
  isSafeRelativePath,
  resolveInboxLink,
  workspaceForPath,
  type DeepLinkContext,
  type DeepLinkResult,
  type DeepLinkSource,
  type DeepLinkUnavailable,
} from '@/modules/notifications/lib/deepLink';
import { createRecordKindRegistry, type RecordKindDefinition } from '@/lib/records/registry';
import type { InboxLinkScope, InboxWorkspace } from '@/modules/notifications/types/db.pending';

const WORKSPACES = Object.keys(WORKSPACE_ROOTS) as InboxWorkspace[];

const row = (over: Partial<DeepLinkSource>): DeepLinkSource => ({
  link_scope: 'personal',
  link_vessel_code: null,
  link_workspace: null,
  link_path: null,
  record_kind: null,
  record_id: null,
  ...over,
});

const ctx = (over: Partial<DeepLinkContext> = {}): DeepLinkContext => ({
  fleetReach: true,
  reachableVesselCodes: new Set(['DRA', 'HYD']),
  canOpenWorkspace: () => true,
  ...over,
});

const href = (href: string): DeepLinkResult => ({ kind: 'link', href });
const off = (reason: DeepLinkUnavailable): DeepLinkResult => ({ kind: 'unavailable', reason });

/** Path shapes a notification may carry, with what follows the scope root for each. */
const SAFE_PATHS: Array<{ path: string | null; tail: string | null }> = [
  { path: null, tail: null },
  { path: '', tail: null },
  { path: 'crew/list', tail: '/crew/list' },
  { path: 'safety/permits/0b9c1a52-6f7a-4c8e-9d1e-2b3c4d5e6f70', tail: '/safety/permits/0b9c1a52-6f7a-4c8e-9d1e-2b3c4d5e6f70' },
  { path: 'crew/list?tab=open', tail: '/crew/list?tab=open' },
  { path: 'crew/list#section-2', tail: '/crew/list#section-2' },
  { path: 'crew/list?tab=open&sort=due#row-4', tail: '/crew/list?tab=open&sort=due#row-4' },
  { path: 'a/b/c/d', tail: '/a/b/c/d' },
  { path: 'reports/2026.11', tail: '/reports/2026.11' },
  { path: 'x', tail: '/x' },
  { path: 'x'.repeat(500), tail: `/${'x'.repeat(500)}` },
];

/** Query- or hash-only paths: the scope's home with that query or hash. */
const SUFFIX_PATHS = ['?tab=open', '#top', '?a=1#b'];

const UNSAFE_PATHS: string[] = [
  '/crew/list',
  '//evil.example',
  '\\\\evil.example',
  '..',
  '../fleet/dashboard',
  'crew/../../fleet',
  'crew/..',
  'a//b',
  'a\\b',
  'https://evil.example/x',
  'http:x',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'mailto:someone',
  'data:text/html,x',
  'vbscript:x',
  'crew:list',
  '%2e%2e/fleet',
  '%2E%2E/fleet',
  'a/%2e/b',
  'a/.%2E/b',
  'crew/%2e',
  'a\u0000b',
  'a\nb',
  'a\rb',
  'a\tb',
  'a\u001fb',
  'a\u007fb',
  'a\u0085b',
  'a\u009fb',
  'x'.repeat(501),
];

describe('isSafeRelativePath', () => {
  it('accepts relative paths with a query and hash', () => {
    for (const { path } of SAFE_PATHS) if (path) expect(isSafeRelativePath(path), path).toBe(true);
    for (const path of SUFFIX_PATHS) expect(isSafeRelativePath(path), path).toBe(true);
    expect(isSafeRelativePath('crew list')).toBe(true);
    expect(isSafeRelativePath('ünïcödé/päth')).toBe(true);
    expect(isSafeRelativePath('a%20b')).toBe(true);
  });

  it('refuses empty, too long, absolute, traversal, double slash, backslash, schemes, %2e and control characters', () => {
    expect(isSafeRelativePath('')).toBe(false);
    for (const path of UNSAFE_PATHS) expect(isSafeRelativePath(path), JSON.stringify(path)).toBe(false);
  });

  it('matches the inbox link_path CHECK, character for character', () => {
    // notification_inbox_link_path_check (Phase 2 spec §A.15), as a JS regex with the same flags (~* is case-insensitive).
    const check = /(^\/)|(\.\.)|(\/\/)|(\\)|(^[A-Za-z][A-Za-z0-9+.-]*:)|(%2e)/i;
    // [[:cntrl:]] in a UTF-8 database: C0, DEL and C1.
    const cntrl = (p: string) => Array.from(p).some((c) => {
      const n = c.codePointAt(0) ?? 0;
      return n <= 0x1f || (n >= 0x7f && n <= 0x9f);
    });
    const sqlAccepts = (p: string) => p.length >= 1 && p.length <= 500 && !check.test(p) && !cntrl(p);
    for (const path of [...UNSAFE_PATHS, ...SUFFIX_PATHS, ...SAFE_PATHS.map((s) => s.path ?? '')]) {
      expect(isSafeRelativePath(path), JSON.stringify(path)).toBe(sqlAccepts(path));
    }
  });
});

describe('vessel scope', () => {
  it('opens /v/<code>/<path> for a reached vessel, for every path shape', () => {
    for (const { path, tail } of SAFE_PATHS) {
      expect(resolveInboxLink(row({ link_scope: 'vessel', link_vessel_code: 'DRA', link_path: path }), ctx()), String(path)).toEqual(
        href(`/v/dra${tail ?? ''}`),
      );
    }
    for (const path of SUFFIX_PATHS) {
      expect(resolveInboxLink(row({ link_scope: 'vessel', link_vessel_code: 'DRA', link_path: path }), ctx())).toEqual(href(`/v/dra${path}`));
    }
  });

  it('matches the code without regard to case, on both sides, and writes it in lower case (D-111)', () => {
    for (const code of ['DRA', 'dra', 'Dra', ' dra ', 'dRa']) {
      for (const reachable of [['DRA'], ['dra'], ['Dra']]) {
        const result = resolveInboxLink(
          row({ link_scope: 'vessel', link_vessel_code: code, link_path: 'crew/list' }),
          ctx({ reachableVesselCodes: new Set(reachable) }),
        );
        expect(result, `${code} in ${reachable}`).toEqual(href('/v/dra/crew/list'));
      }
    }
  });

  it('refuses a vessel the viewer does not reach, whatever the fleet reach', () => {
    for (const fleetReach of [true, false]) {
      expect(
        resolveInboxLink(row({ link_scope: 'vessel', link_vessel_code: 'GAM', link_path: 'crew/list' }), ctx({ fleetReach })),
      ).toEqual(off('no_reach'));
      expect(
        resolveInboxLink(row({ link_scope: 'vessel', link_vessel_code: 'DRA' }), ctx({ fleetReach, reachableVesselCodes: new Set() })),
      ).toEqual(off('no_reach'));
    }
  });

  it('has no target without a code, or with one that is not a vessel code', () => {
    for (const code of [null, '', '   ', 'DR', 'DRAK', '1AB', 'D-A', 'D/A', '../', 'Ä12']) {
      expect(resolveInboxLink(row({ link_scope: 'vessel', link_vessel_code: code, link_path: 'crew/list' }), ctx()), String(code)).toEqual(
        off('no_target'),
      );
    }
  });

  it('reach does not open a vessel when the code only looks like one in reach', () => {
    expect(
      resolveInboxLink(row({ link_scope: 'vessel', link_vessel_code: 'DRB' }), ctx({ reachableVesselCodes: new Set(['DRA']) })),
    ).toEqual(off('no_reach'));
  });
});

describe('fleet scope', () => {
  it('opens /fleet/<path> with fleet reach (no path: the Fleet dashboard)', () => {
    for (const { path, tail } of SAFE_PATHS) {
      expect(resolveInboxLink(row({ link_scope: 'fleet', link_path: path }), ctx()), String(path)).toEqual(
        href(tail ? `/fleet${tail}` : FLEET_HOME),
      );
    }
    for (const path of SUFFIX_PATHS) {
      expect(resolveInboxLink(row({ link_scope: 'fleet', link_path: path }), ctx())).toEqual(href(`${FLEET_HOME}${path}`));
    }
  });

  it('refuses without fleet reach, even for a viewer who reaches vessels', () => {
    for (const { path } of SAFE_PATHS) {
      expect(resolveInboxLink(row({ link_scope: 'fleet', link_path: path }), ctx({ fleetReach: false }))).toEqual(off('no_fleet_reach'));
    }
  });

  it('ignores a vessel code on a fleet link', () => {
    expect(
      resolveInboxLink(row({ link_scope: 'fleet', link_vessel_code: 'GAM', link_path: 'documents' }), ctx({ reachableVesselCodes: new Set() })),
    ).toEqual(href('/fleet/documents'));
  });
});

describe('personal scope', () => {
  it('opens /me/<path> (no path: /inbox) for everyone', () => {
    for (const reach of [ctx(), ctx({ fleetReach: false, reachableVesselCodes: new Set(), canOpenWorkspace: () => false })]) {
      for (const { path, tail } of SAFE_PATHS) {
        expect(resolveInboxLink(row({ link_scope: 'personal', link_path: path }), reach), String(path)).toEqual(
          href(tail ? `/me${tail}` : '/inbox'),
        );
      }
      for (const path of SUFFIX_PATHS) {
        expect(resolveInboxLink(row({ link_scope: 'personal', link_path: path }), reach)).toEqual(href(`/inbox${path}`));
      }
    }
  });
});

describe('workspace scope', () => {
  it('opens the workspace root + path when its Apps entry admits the viewer (D-97)', () => {
    for (const ws of WORKSPACES) {
      const root = WORKSPACE_ROOTS[ws];
      for (const { path, tail } of SAFE_PATHS) {
        expect(resolveInboxLink(row({ link_scope: 'workspace', link_workspace: ws, link_path: path }), ctx()), `${ws} ${path}`).toEqual(
          href(tail ? `${root}${tail}` : root),
        );
      }
      for (const path of SUFFIX_PATHS) {
        expect(resolveInboxLink(row({ link_scope: 'workspace', link_workspace: ws, link_path: path }), ctx())).toEqual(href(`${root}${path}`));
      }
    }
  });

  it('asks the gate about that workspace only, and refuses when it says no', () => {
    for (const ws of WORKSPACES) {
      const asked: InboxWorkspace[] = [];
      const gate = (w: InboxWorkspace) => {
        asked.push(w);
        return w !== ws;
      };
      expect(resolveInboxLink(row({ link_scope: 'workspace', link_workspace: ws, link_path: 'x' }), ctx({ canOpenWorkspace: gate }))).toEqual(
        off('workspace_denied'),
      );
      expect(asked).toEqual([ws]);
    }
  });

  it('has no target for a missing or unknown workspace (incl. prototype keys)', () => {
    for (const ws of [null, 'finance', 'HRIS', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(
        resolveInboxLink(row({ link_scope: 'workspace', link_workspace: ws as InboxWorkspace | null, link_path: 'x' }), ctx()),
        String(ws),
      ).toEqual(off('no_target'));
    }
  });

  it('the legal workspace root is the departments route', () => {
    expect(resolveInboxLink(row({ link_scope: 'workspace', link_workspace: 'legal', link_path: 'matters' }), ctx())).toEqual(
      href('/departments/legal/matters'),
    );
  });
});

describe('every scope refuses unsafe paths before reach is considered', () => {
  const scopes: Array<Partial<DeepLinkSource>> = [
    { link_scope: 'vessel', link_vessel_code: 'DRA' },
    { link_scope: 'vessel', link_vessel_code: 'GAM' },
    { link_scope: 'fleet' },
    { link_scope: 'personal' },
    ...WORKSPACES.map((ws) => ({ link_scope: 'workspace' as const, link_workspace: ws })),
  ];
  it.each(UNSAFE_PATHS.map((p) => [JSON.stringify(p), p]))('%s', (_label, path) => {
    for (const scope of scopes) {
      for (const reach of [ctx(), ctx({ fleetReach: false, reachableVesselCodes: new Set(), canOpenWorkspace: () => false })]) {
        expect(resolveInboxLink(row({ ...scope, link_path: path }), reach)).toEqual(off('invalid_path'));
      }
    }
  });

  it('an unsafe path wins over a record kind and id (the path is what the row asks for)', () => {
    expect(
      resolveInboxLink(
        row({ link_scope: 'vessel', link_vessel_code: 'DRA', link_path: '../x', record_kind: 'safety.permit', record_id: 'r1' }),
        ctx({ routeForKind: () => '/v/:vesselCode/safety/permits/:id' }),
      ),
    ).toEqual(off('invalid_path'));
  });
});

describe('unknown scope', () => {
  it('has no target', () => {
    for (const scope of ['', 'company', 'VESSEL', 'workspaces', 'me']) {
      expect(resolveInboxLink(row({ link_scope: scope as InboxLinkScope, link_path: 'x' }), ctx())).toEqual(off('no_target'));
    }
  });
});

describe('every link stays inside its scope root', () => {
  const ROOTS: Record<string, string> = { vessel: '/v/dra', fleet: '/fleet', personal: '/me', inbox: '/inbox' };
  it('for every scope, safe path and reach', () => {
    const sources: DeepLinkSource[] = [];
    for (const { path } of SAFE_PATHS) {
      sources.push(row({ link_scope: 'vessel', link_vessel_code: 'dra', link_path: path }));
      sources.push(row({ link_scope: 'fleet', link_path: path }));
      sources.push(row({ link_scope: 'personal', link_path: path }));
      for (const ws of WORKSPACES) sources.push(row({ link_scope: 'workspace', link_workspace: ws, link_path: path }));
    }
    for (const source of sources) {
      const result = resolveInboxLink(source, ctx());
      expect(result.kind).toBe('link');
      if (result.kind !== 'link') continue;
      const allowed = [...Object.values(ROOTS), ...Object.values(WORKSPACE_ROOTS)];
      expect(allowed.some((r) => result.href === r || result.href.startsWith(`${r}/`) || result.href.startsWith(`${r}?`) || result.href.startsWith(`${r}#`)), result.href).toBe(true);
      const pathname = result.href.split(/[?#]/)[0];
      expect(pathname.includes('//') || pathname.includes('..'), result.href).toBe(false);
    }
  });
});

describe('record kind and id (registry route patterns)', () => {
  const RID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
  const routes: Record<string, string> = {
    'safety.corrective_action': '/v/:vesselCode/safety/corrective-actions/:id',
    'fleet.document': '/fleet/documents/:id',
    'hris.leave_request': '/hris/leave/requests/:id',
    'legal.matter': '/departments/legal/matters/:id',
    'health.case': '/health/medical/cases/:id',
    'yard.work_order': '/yard/refit/work-orders/:id',
    'shoreside.request': '/shoreside/requests/:id',
    'personal.thing': '/me/things/:id',
    'elsewhere.thing': '/elsewhere/:id',
    'hrisx.thing': '/hrisx/:id',
    'extra.param': '/v/:vesselCode/x/:other/:id',
    'fixed.vessel': '/v/dra/x/:id',
    'fleet.root': '/fleet',
  };
  const withKinds = (over: Partial<DeepLinkContext> = {}) => ctx({ routeForKind: (k) => routes[k], ...over });
  const kindRow = (kind: string, over: Partial<DeepLinkSource> = {}) =>
    row({ link_scope: 'vessel', link_vessel_code: 'DRA', record_kind: kind, record_id: RID, ...over });

  it('fills a vessel kind with the lower-case code and the id, for upper and lower codes', () => {
    for (const code of ['DRA', 'dra']) {
      expect(resolveInboxLink(kindRow('safety.corrective_action', { link_vessel_code: code }), withKinds())).toEqual(
        href(`/v/dra/safety/corrective-actions/${RID}`),
      );
    }
  });

  it('a vessel kind needs reach to that vessel (fleet reach does not stand in), and a code', () => {
    expect(resolveInboxLink(kindRow('safety.corrective_action', { link_vessel_code: 'GAM' }), withKinds())).toEqual(off('no_reach'));
    expect(resolveInboxLink(kindRow('safety.corrective_action', { link_vessel_code: null }), withKinds())).toEqual(off('no_target'));
    expect(resolveInboxLink(kindRow('safety.corrective_action', { link_vessel_code: 'DRAK' }), withKinds())).toEqual(off('no_target'));
  });

  it('a fleet kind needs fleet reach', () => {
    expect(resolveInboxLink(kindRow('fleet.document', { link_scope: 'fleet', link_vessel_code: null }), withKinds())).toEqual(
      href(`/fleet/documents/${RID}`),
    );
    expect(
      resolveInboxLink(kindRow('fleet.document', { link_scope: 'fleet', link_vessel_code: null }), withKinds({ fleetReach: false })),
    ).toEqual(off('no_fleet_reach'));
    expect(resolveInboxLink(kindRow('fleet.root', { link_scope: 'fleet' }), withKinds())).toEqual(href('/fleet'));
  });

  it('a workspace-scoped kind needs a WORKSPACE_ROOTS entry the viewer may open', () => {
    const cases: Array<[string, InboxWorkspace, string]> = [
      ['hris.leave_request', 'hris', `/hris/leave/requests/${RID}`],
      ['legal.matter', 'legal', `/departments/legal/matters/${RID}`],
      ['health.case', 'health', `/health/medical/cases/${RID}`],
      ['yard.work_order', 'yard', `/yard/refit/work-orders/${RID}`],
      ['shoreside.request', 'shoreside', `/shoreside/requests/${RID}`],
    ];
    for (const [kind, ws, expected] of cases) {
      expect(resolveInboxLink(kindRow(kind, { link_scope: 'workspace', link_workspace: ws }), withKinds())).toEqual(href(expected));
      const asked: InboxWorkspace[] = [];
      const denied = withKinds({
        canOpenWorkspace: (w) => {
          asked.push(w);
          return false;
        },
      });
      // The route decides the workspace, not the row's link_workspace.
      expect(resolveInboxLink(kindRow(kind, { link_scope: 'workspace', link_workspace: 'hris' }), denied)).toEqual(off('workspace_denied'));
      expect(asked).toEqual([ws]);
    }
  });

  it('a kind route outside /v/, /fleet/ and the workspace roots has no target', () => {
    for (const kind of ['personal.thing', 'elsewhere.thing', 'hrisx.thing']) {
      expect(resolveInboxLink(kindRow(kind), withKinds()), kind).toEqual(off('no_target'));
    }
  });

  it('a pattern with any other :param, or a vessel route that names no vessel, has no target', () => {
    expect(resolveInboxLink(kindRow('extra.param'), withKinds())).toEqual(off('no_target'));
    expect(resolveInboxLink(kindRow('fixed.vessel'), withKinds())).toEqual(off('no_target'));
  });

  it('an unknown kind, a context without the registry, or a relative pattern has no target', () => {
    expect(resolveInboxLink(kindRow('safety.unknown'), withKinds())).toEqual(off('no_target'));
    expect(resolveInboxLink(kindRow('safety.corrective_action'), ctx())).toEqual(off('no_target'));
    expect(resolveInboxLink(kindRow('x.y'), ctx({ routeForKind: () => 'v/:vesselCode/x/:id' }))).toEqual(off('no_target'));
    expect(resolveInboxLink(kindRow('x.y'), ctx({ routeForKind: () => '' }))).toEqual(off('no_target'));
  });

  it('encodes the id, so it can never add a path segment', () => {
    expect(resolveInboxLink(kindRow('safety.corrective_action', { record_id: '../../fleet' }), withKinds())).toEqual(
      href('/v/dra/safety/corrective-actions/..%2F..%2Ffleet'),
    );
    expect(resolveInboxLink(kindRow('safety.corrective_action', { record_id: 'a?b#c' }), withKinds())).toEqual(
      href('/v/dra/safety/corrective-actions/a%3Fb%23c'),
    );
  });

  it('a path wins over the record (the row names the exact page)', () => {
    expect(resolveInboxLink(kindRow('safety.corrective_action', { link_path: 'safety/overview' }), withKinds())).toEqual(
      href('/v/dra/safety/overview'),
    );
  });

  it('a kind without an id, or an id without a kind, falls back to the scope link', () => {
    expect(resolveInboxLink(kindRow('safety.corrective_action', { record_id: null }), withKinds())).toEqual(href('/v/dra'));
    expect(resolveInboxLink(row({ link_scope: 'vessel', link_vessel_code: 'DRA', record_id: RID }), withKinds())).toEqual(href('/v/dra'));
  });

  it('works with patterns the real registry accepts (vessel and fleet kinds)', () => {
    const registry = createRecordKindRegistry();
    const base: Omit<RecordKindDefinition, 'key' | 'moduleKey' | 'label' | 'refPrefix' | 'scope' | 'routePattern'> = {
      capabilityPath: 'records.test.links',
      enveloped: false,
      companyStep: 'none',
      editAfterSign: 'allow_with_flag',
      deleteRule: 'free',
      slotTemplate: [],
    };
    registry.register({ ...base, key: 'safety.permit', moduleKey: 'safety', label: 'Permit', refPrefix: 'PTW', scope: 'vessel', routePattern: '/v/:vesselCode/safety/permits/:id' });
    registry.register({ ...base, key: 'fleet.circular', moduleKey: 'fleet', label: 'Circular', refPrefix: 'CIR', scope: 'fleet', routePattern: '/fleet/documents/circulars/:id' });
    registry.register({ ...base, key: 'hris.contract', moduleKey: 'hris', label: 'Contract', refPrefix: 'CON', scope: 'fleet', routePattern: '/hris/contracts/:id' });
    registry.register({ ...base, key: 'safety.note', moduleKey: 'safety', label: 'Note', refPrefix: 'NTE', scope: 'vessel' });
    const routeForKind = (key: string) => registry.get(key)?.routePattern;
    expect(resolveInboxLink(kindRow('safety.permit', { link_vessel_code: 'hyd' }), ctx({ routeForKind }))).toEqual(href(`/v/hyd/safety/permits/${RID}`));
    expect(resolveInboxLink(kindRow('fleet.circular', { link_scope: 'fleet' }), ctx({ routeForKind }))).toEqual(
      href(`/fleet/documents/circulars/${RID}`),
    );
    expect(resolveInboxLink(kindRow('hris.contract', { link_scope: 'fleet' }), ctx({ routeForKind, canOpenWorkspace: (w) => w !== 'hris' }))).toEqual(
      off('workspace_denied'),
    );
    expect(resolveInboxLink(kindRow('safety.note'), ctx({ routeForKind }))).toEqual(off('no_target'));
  });
});

describe('workspaceForPath', () => {
  it('finds the workspace a path sits under, by whole segments', () => {
    expect(workspaceForPath('/hris')).toBe('hris');
    expect(workspaceForPath('/hris/leave')).toBe('hris');
    expect(workspaceForPath('/departments/legal/x')).toBe('legal');
    expect(workspaceForPath('/hrisx')).toBeUndefined();
    expect(workspaceForPath('/departments')).toBeUndefined();
    expect(workspaceForPath('/fleet/hris')).toBeUndefined();
  });
});

describe('copy', () => {
  it('explains every reason', () => {
    const reasons: DeepLinkUnavailable[] = ['no_reach', 'no_fleet_reach', 'workspace_denied', 'invalid_path', 'no_target'];
    for (const reason of reasons) expect(DEEP_LINK_UNAVAILABLE_DETAIL[reason]).toMatch(/\.$/);
  });
});
