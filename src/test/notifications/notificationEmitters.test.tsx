/**
 * Seeded engine notification types with no emitter yet (D-238; non-negotiable
 * 9: no fake controls). The seed in 20261123030000_platform_notification_outbox
 * lists every engine type (category 'Records'); each one is either produced by
 * a live emitter (LIVE_ENGINE_NOTIFICATION_TYPES) or deferred with a named
 * future emitter (DEFERRED_NOTIFICATION_TYPES), so a new seed cannot silently
 * go unwired. A deferred type shows "Not available yet" in place of the
 * preference switch (/me/notifications).
 *
 * Platform-prep PP4: the Phase 3 wave 1 stream types are seeded by
 * 20261124030100 (Crew, Documents, Training) and declared, with their status
 * and emitter, in the owning manifest; both seed files are checked against
 * the platform lists plus the manifests (each seeded engine type in exactly
 * one place), and the registry validates the declarations.
 *
 * Engine types, live or deferred, are in-app only (D-249): Notification
 * Management shows them as plain rows (no drawer, no save, not a
 * "No recipients" gap), and no email is sent to any subscriber until the
 * gap/03 C3 dispatcher lands (EMAIL_DELIVERY_LIVE), so the page says so and
 * the save toast does not promise delivery.
 */
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readRepoFile } from '../design/cssTokens';
import { buildRegistry } from '@/app/registry/registry';
import type { ModuleManifest } from '@/app/registry/types';

type Cadence = 'realtime' | 'daily' | 'weekly';
interface TypeRow {
  key: string;
  name: string;
  category: string;
  cadence: Cadence;
  description: string | null;
  sort_order: number;
}
interface SubRow {
  id: string;
  company_id: string;
  notification_type_key: string;
  user_id: string | null;
  email: string | null;
  vessel_scope: 'all' | 'specific';
  vessel_ids: string[];
  channels: { in_app: boolean; email: boolean };
}

const h = vi.hoisted(() => ({
  types: [] as TypeRow[],
  subs: [] as SubRow[],
  toggleMutate: vi.fn(),
  saveMutate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/modules/notifications-admin/hooks/useNotificationData', () => ({
  useNotificationTypes: () => ({ data: h.types }),
  useNotificationSubscriptions: () => ({ data: h.subs }),
  useMyNotificationPreferences: () => ({ data: [] }),
  useToggleMyPreference: () => ({ mutate: h.toggleMutate, isPending: false }),
  useSaveSubscriptions: () => ({ mutate: h.saveMutate, isPending: false }),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/shared/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));

import {
  DEFERRED_NOTIFICATION_TYPES,
  MODULE_NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_SETS,
  foldNotificationTypes,
  EMAIL_DELIVERY_LIVE,
  EMAIL_NOT_LIVE_DESCRIPTION,
  EMAIL_NOT_LIVE_TITLE,
  IN_APP_ONLY_COPY,
  IN_APP_ONLY_DESCRIPTION,
  LIVE_ENGINE_NOTIFICATION_TYPES,
  NOT_AVAILABLE_COPY,
  NOT_AVAILABLE_DESCRIPTION,
  isEngineNotificationType,
  isNotificationTypeAvailable,
  takesSubscriptions,
} from '@/modules/notifications-admin/lib/notificationEmitters';
import NotificationsPage from '@/modules/notifications/pages/NotificationsPage';
import NotificationManagementPage from '@/modules/notifications-admin/pages/NotificationManagementPage';
import { EditSubscriptionDrawer } from '@/modules/notifications-admin/components/EditSubscriptionDrawer';

const SEED_FILE = 'supabase/migrations/20261123030000_platform_notification_outbox.sql';
/** The Phase 3 wave 1 stream types (platform-prep PP4): declared in the owning manifests. */
const STREAM_SEED_FILE = 'supabase/migrations/20261124030100_platform_stream_notification_types.sql';

interface SeedRow {
  key: string;
  name: string;
  category: string;
  description: string;
}

/** The (key, name, category, cadence, description) tuples of a notification_types seed. */
function seededTypesIn(file: string): SeedRow[] {
  const sql = readRepoFile(file);
  const start = sql.indexOf('INSERT INTO public.notification_types');
  expect(start, `the notification_types seed is in ${file}`).toBeGreaterThan(-1);
  const end = sql.indexOf('ON CONFLICT', start);
  expect(end).toBeGreaterThan(start);
  const block = sql.slice(start, end);
  const rows: SeedRow[] = [];
  const text = "'((?:[^']|'')*)'";
  const tuple = new RegExp(`\\(\\s*'([a-z0-9_]+)'\\s*,\\s*${text}\\s*,\\s*${text}\\s*,\\s*${text}\\s*,\\s*${text}`, 'g');
  for (const m of block.matchAll(tuple)) rows.push({ key: m[1], name: m[2], category: m[3], description: m[5] });
  return rows;
}

const seededTypes = () => seededTypesIn(SEED_FILE);

const LIVE: readonly string[] = LIVE_ENGINE_NOTIFICATION_TYPES;
const DEFERRED: readonly string[] = DEFERRED_NOTIFICATION_TYPES;

describe('engine notification types: live or deferred (D-238)', () => {
  it('parses the seed', () => {
    const rows = seededTypes();
    expect(rows.length).toBeGreaterThanOrEqual(LIVE.length + DEFERRED.length);
    expect(rows.find((r) => r.key === 'signature_requested')?.category).toBe('Records');
  });

  it('every seeded Records type is live or deferred, and every listed type is seeded as Records', () => {
    const records = seededTypes().filter((r) => r.category === 'Records').map((r) => r.key);
    const unwired = records.filter((k) => !LIVE.includes(k) && !DEFERRED.includes(k));
    expect(unwired, 'a seeded engine type has no emitter and is not listed as deferred').toEqual([]);
    const stale = [...LIVE, ...DEFERRED].filter((k) => !records.includes(k));
    expect(stale, 'a listed type is not seeded as an engine type').toEqual([]);
  });

  it('the two lists are disjoint and have no duplicates', () => {
    expect(LIVE.filter((k) => DEFERRED.includes(k))).toEqual([]);
    expect(new Set(LIVE).size).toBe(LIVE.length);
    expect(new Set(DEFERRED).size).toBe(DEFERRED.length);
  });

  it('DEFERRED is exactly the six types without an emitter', () => {
    expect([...DEFERRED].sort()).toEqual(
      [
        'invitation_accepted',
        'invitation_bounced',
        'signature_reminder',
        'signatures_stale',
        'status_request_due',
        'status_request_overdue',
      ].sort(),
    );
  });

  it('isNotificationTypeAvailable: false only for deferred types; live and legacy types stay available', () => {
    for (const k of DEFERRED) expect(isNotificationTypeAvailable(k)).toBe(false);
    for (const k of LIVE) expect(isNotificationTypeAvailable(k)).toBe(true);
    expect(isNotificationTypeAvailable('certificate_expiring')).toBe(true);
    expect(NOT_AVAILABLE_COPY).toBe('Not available yet');
  });

  it('isEngineNotificationType: true for every live and deferred key; only legacy types take subscriptions (D-249)', () => {
    for (const k of [...LIVE, ...DEFERRED]) {
      expect(isEngineNotificationType(k), k).toBe(true);
      expect(takesSubscriptions(k), k).toBe(false);
    }
    expect(isEngineNotificationType('certificate_expiring')).toBe(false);
    expect(takesSubscriptions('certificate_expiring')).toBe(true);
  });

  it('email delivery is not live until the C3 dispatcher reads notification_subscriptions (D-249)', () => {
    expect(EMAIL_DELIVERY_LIVE).toBe(false);
    expect(IN_APP_ONLY_COPY).toBe('In-app only');
    expect(EMAIL_NOT_LIVE_TITLE).toBe('Email delivery is not live yet');
  });
});

// ─── Module-owned types (platform-prep PP4): manifest-declared liveness ────

/** The owner of each stream category (platform-prep plan §2). */
const CATEGORY_OWNER: Readonly<Record<string, string>> = { Crew: 'crew', Documents: 'documents', Training: 'development' };

const WAVE1_STREAM_TYPES = [
  'crew_document_review_needed',
  'crew_document_decided',
  'crew_document_expiring',
  'hor_reminder',
  'hor_serious_breach',
  'hor_breach_report',
  'hor_correction_requested',
  'familiarisation_assigned',
  'crew_transfer_submitted',
  'crew_transfer_completed',
  'crew_employment_ended',
  'fleet_document_published',
  'fleet_document_ack_reminder',
  'fleet_document_ack_due_soon',
  'fleet_document_ack_overdue',
  'fleet_document_ack_digest',
  'training_application_action_needed',
  'training_application_updated',
  'training_applications_stale',
];

describe('module-owned notification types (PP4; D-238, D-249)', () => {
  const stream = () => seededTypesIn(STREAM_SEED_FILE);
  const declared = MODULE_NOTIFICATION_TYPES;

  it('20261124030100 seeds exactly the wave 1 stream types, in the Crew, Documents and Training categories', () => {
    expect(stream().map((r) => r.key)).toEqual(WAVE1_STREAM_TYPES);
    expect(new Set(stream().map((r) => r.category))).toEqual(new Set(['Crew', 'Documents', 'Training']));
    expect(stream().filter((r) => r.category === 'Crew')).toHaveLength(11);
  });

  it('every stream seed is declared in exactly one manifest, the one that owns its category', () => {
    for (const row of stream()) {
      const owners = declared.filter((t) => t.key === row.key).map((t) => t.moduleId);
      expect(owners, row.key).toEqual([CATEGORY_OWNER[row.category]]);
    }
  });

  it('every manifest declaration is a stream seed (never a Records type, never unseeded), with a named emitter', () => {
    const streamKeys = stream().map((r) => r.key);
    const records = seededTypes().map((r) => r.key);
    for (const t of declared) {
      expect(streamKeys, `${t.moduleId}: ${t.key} is seeded by 20261124030100`).toContain(t.key);
      expect(records, `${t.key} is not also an engine Records seed`).not.toContain(t.key);
      expect(t.emitter.trim().length, t.key).toBeGreaterThan(5);
      expect(['deferred', 'live']).toContain(t.status);
    }
    expect(declared.map((t) => t.key).sort()).toEqual([...WAVE1_STREAM_TYPES].sort());
  });

  it('each seeded engine type is in exactly one place: the platform live list, the platform deferred list or one manifest', () => {
    const places = new Map<string, string[]>();
    const add = (key: string, where: string) => places.set(key, [...(places.get(key) ?? []), where]);
    for (const k of LIVE) add(k, 'platform live');
    for (const k of DEFERRED) add(k, 'platform deferred');
    for (const t of declared) add(t.key, `manifest ${t.moduleId}`);
    for (const row of [...seededTypes().filter((r) => r.category === 'Records'), ...stream()]) {
      expect(places.get(row.key), row.key).toHaveLength(1);
    }
    expect([...places.keys()].sort()).toEqual([...seededTypes().filter((r) => r.category === 'Records'), ...stream()].map((r) => r.key).sort());
  });

  it('the stream seeds are in-app only: no copy mentions email, and they are seeded nowhere else', () => {
    for (const row of stream()) expect(`${row.name} ${row.description}`, row.key).not.toMatch(/e-?mail/i);
    for (const file of ['supabase/migrations/20260522163528_da5bbfde-7251-4d89-9c3d-fc2360137af6.sql', SEED_FILE]) {
      const sql = readRepoFile(file);
      for (const key of WAVE1_STREAM_TYPES) expect(sql.includes(`'${key}'`), `${key} in ${file}`).toBe(false);
    }
  });

  it('crew_document_expiring is adopted from HRIS phase 1 (already live, category Crew): the only stream key seeded before', () => {
    const hris = seededTypesIn('supabase/migrations/20260917110000_hris_phase1_employee_records.sql');
    const named = hris.filter((r) => WAVE1_STREAM_TYPES.includes(r.key));
    expect(named.map((r) => [r.key, r.category])).toEqual([['crew_document_expiring', 'Crew']]);
    expect(declared.find((t) => t.key === 'crew_document_expiring')?.moduleId).toBe('crew');
    expect(readRepoFile(STREAM_SEED_FILE)).toContain('One key is adopted, not new: crew_document_expiring');
  });

  it('the folded sets: a declared deferred type is "Not available yet", a declared live one is available; both are engine types without subscriptions', () => {
    for (const t of declared) {
      expect(NOTIFICATION_TYPE_SETS.engine.has(t.key), t.key).toBe(true);
      expect(isEngineNotificationType(t.key), t.key).toBe(true);
      expect(takesSubscriptions(t.key), t.key).toBe(false);
      expect(isNotificationTypeAvailable(t.key), t.key).toBe(t.status === 'live');
    }
    const folded = foldNotificationTypes(['a_deferred'], ['a_live'], [
      { key: 'm_deferred', status: 'deferred' },
      { key: 'm_live', status: 'live' },
    ]);
    expect([...folded.deferred].sort()).toEqual(['a_deferred', 'm_deferred']);
    expect([...folded.live].sort()).toEqual(['a_live', 'm_live']);
    expect([...folded.engine].sort()).toEqual(['a_deferred', 'a_live', 'm_deferred', 'm_live']);
  });

  it('the legacy Crew types keep their subscriptions', () => {
    for (const legacy of ['crew_changes', 'crew_certificate_expiries', 'leave_requests']) {
      expect(isEngineNotificationType(legacy), legacy).toBe(false);
      expect(takesSubscriptions(legacy), legacy).toBe(true);
    }
  });
});

describe('registry: manifest notification types are validated (PP4)', () => {
  const manifest = (id: string, notificationTypes: ModuleManifest['notificationTypes']): ModuleManifest => ({
    id,
    label: id,
    scopes: ['vessel'],
    notificationTypes,
  });

  it('a key declared by two manifests is a problem and only the first (id order) keeps it', () => {
    const registry = buildRegistry([
      manifest('beta', [{ key: 'shared_type', status: 'live', emitter: 'beta_emit()' }]),
      manifest('alpha', [{ key: 'shared_type', status: 'deferred', emitter: 'alpha_emit()' }]),
    ]);
    expect(registry.problems).toEqual(['beta: notification type "shared_type" is already declared by alpha']);
    expect(registry.notificationTypes).toEqual([{ key: 'shared_type', status: 'deferred', emitter: 'alpha_emit()', moduleId: 'alpha' }]);
  });

  it('a bad key, an unknown status and a missing emitter are problems, not throws', () => {
    const registry = buildRegistry([
      manifest('gamma', [
        { key: 'Bad Key', status: 'deferred', emitter: 'x()' },
        { key: 'ok_type', status: 'maybe' as never, emitter: 'x()' },
        { key: 'no_emitter', status: 'deferred', emitter: ' ' },
        { key: 'fine_type', status: 'deferred', emitter: 'fine_emit()' },
      ]),
    ]);
    expect(registry.problems).toEqual([
      'gamma: notification type "Bad Key" has no snake_case key',
      'gamma: notification type "ok_type" has status "maybe" (deferred or live)',
      'gamma: notification type "no_emitter" names no emitter',
    ]);
    expect(registry.notificationTypes.map((t) => t.key)).toEqual(['fine_type']);
  });
});

const LIVE_TYPE: TypeRow = {
  key: 'signature_requested',
  name: 'Signature requested',
  category: 'Records',
  cadence: 'realtime',
  description: 'A record is waiting for your signature',
  sort_order: 300,
};
/** A legacy (non-engine) type: the only kind that takes recipient subscriptions (D-249). */
const LEGACY_TYPE: TypeRow = {
  key: 'certificate_expiring',
  name: 'Certificate expiring',
  category: 'Certificates',
  cadence: 'daily',
  description: 'A vessel certificate is close to its expiry date',
  sort_order: 10,
};
const DEFERRED_TYPE: TypeRow = {
  key: 'signature_reminder',
  name: 'Signature reminder',
  category: 'Records',
  cadence: 'daily',
  description: 'A record still needs your signature',
  sort_order: 299,
};

const rowOf = (key: string): HTMLElement => {
  const row = document.querySelector<HTMLElement>(`[data-notification-type="${key}"]`);
  if (!row) throw new Error(`no row for ${key}`);
  return row;
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

afterEach(() => {
  cleanup();
  h.toggleMutate.mockReset();
  h.saveMutate.mockReset();
  h.toast.mockReset();
  h.subs = [];
});

const subOn = (typeKey: string, id = 's1'): SubRow => ({
  id,
  company_id: 'c1',
  notification_type_key: typeKey,
  user_id: null,
  email: 'fleet-manager@example.test',
  vessel_scope: 'all',
  vessel_ids: [],
  channels: { in_app: true, email: true },
});

/** The value under a stat card's label (the label is a div; a row's "No recipients" is a span). */
const statValue = (label: string): HTMLElement => {
  const value = screen.getByText(label, { selector: 'div' }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`no value for ${label}`);
  return value;
};

describe('NotificationsPage: deferred types have no switch', () => {
  const renderPage = () =>
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NotificationsPage />
      </MemoryRouter>,
    );

  it('a live type keeps its switch; a deferred type shows "Not available yet" and cannot be toggled', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE];
    renderPage();

    const live = rowOf(LIVE_TYPE.key);
    const liveSwitch = within(live).getByRole('switch', { name: 'Hide Signature requested' });
    fireEvent.click(liveSwitch);
    expect(h.toggleMutate).toHaveBeenCalledTimes(1);
    expect(h.toggleMutate.mock.calls[0][0]).toEqual({ typeKey: LIVE_TYPE.key, enabled: false });
    expect(within(live).queryByText(NOT_AVAILABLE_COPY)).toBeNull();
    h.toggleMutate.mockReset();

    const deferred = rowOf(DEFERRED_TYPE.key);
    expect(within(deferred).queryByRole('switch')).toBeNull();
    expect(within(deferred).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('switch', { name: /Signature reminder/ })).toBeNull();
    const pill = within(deferred).getByText(NOT_AVAILABLE_COPY);
    expect(pill.closest('[data-tone]')).toHaveAttribute('data-tone', 'neutral');
    expect(pill.closest('[data-tone]')).toHaveAccessibleDescription(NOT_AVAILABLE_DESCRIPTION);

    fireEvent.click(deferred);
    fireEvent.click(pill);
    fireEvent.keyDown(pill, { key: ' ' });
    expect(h.toggleMutate).not.toHaveBeenCalled();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });
});

describe('NotificationManagementPage: engine types take no subscription (D-238, D-249)', () => {
  it('the deferred row is not a button, opens no drawer and is not counted as "No recipients"', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    render(<NotificationManagementPage />);

    const deferred = rowOf(DEFERRED_TYPE.key);
    expect(deferred.tagName).not.toBe('BUTTON');
    expect(deferred.closest('button')).toBeNull();
    expect(within(deferred).queryByRole('button')).toBeNull();
    const pill = within(deferred).getByText(NOT_AVAILABLE_COPY);
    expect(pill.closest('[data-tone]')).toHaveAttribute('data-tone', 'neutral');
    expect(pill.closest('[data-tone]')).toHaveAccessibleDescription(NOT_AVAILABLE_DESCRIPTION);
    expect(within(deferred).queryByText('No recipients')).toBeNull();

    fireEvent.click(deferred);
    fireEvent.click(pill);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the live engine row is in-app only: not a button, no recipients label, opens no drawer', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    render(<NotificationManagementPage />);

    const live = rowOf(LIVE_TYPE.key);
    expect(live.tagName).not.toBe('BUTTON');
    expect(live.closest('button')).toBeNull();
    expect(within(live).queryByRole('button')).toBeNull();
    const pill = within(live).getByText(IN_APP_ONLY_COPY);
    expect(pill.closest('[data-tone]')).toHaveAttribute('data-tone', 'neutral');
    expect(pill.closest('[data-tone]')).toHaveAccessibleDescription(IN_APP_ONLY_DESCRIPTION);
    expect(within(live).queryByText('No recipients')).toBeNull();
    expect(within(live).queryByText(NOT_AVAILABLE_COPY)).toBeNull();

    fireEvent.click(live);
    fireEvent.click(pill);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('only the legacy type counts: Total 1, Configured 0, "No recipients (1)", and the filter lists the legacy row only', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    render(<NotificationManagementPage />);

    expect(statValue('Total types')).toHaveTextContent('1');
    expect(statValue('Configured')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'No recipients (1)' })).toBeInTheDocument();
    expect(rowOf(LEGACY_TYPE.key).tagName).toBe('BUTTON');

    fireEvent.click(screen.getByRole('button', { name: 'No recipients (1)' }));
    expect(document.querySelector(`[data-notification-type="${DEFERRED_TYPE.key}"]`)).toBeNull();
    expect(document.querySelector(`[data-notification-type="${LIVE_TYPE.key}"]`)).toBeNull();
    expect(rowOf(LEGACY_TYPE.key).tagName).toBe('BUTTON');
  });

  it('a legacy row opens the drawer; "Subscribe Email" skips engine types listed first', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    render(<NotificationManagementPage />);

    fireEvent.click(screen.getByRole('button', { name: /Subscribe Email/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(LEGACY_TYPE.name)).toBeInTheDocument();
    expect(within(dialog).queryByText(LIVE_TYPE.name)).toBeNull();
    expect(within(dialog).queryByText(DEFERRED_TYPE.name)).toBeNull();
    cleanup();

    render(<NotificationManagementPage />);
    fireEvent.click(rowOf(LEGACY_TYPE.key));
    expect(within(screen.getByRole('dialog')).getByText(LEGACY_TYPE.name)).toBeInTheDocument();
  });

  it('"Subscribe Email" is disabled when only engine types exist', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE];
    render(<NotificationManagementPage />);
    expect(screen.getByRole('button', { name: /Subscribe Email/ })).toBeDisabled();
    expect(statValue('Total types')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'No recipients (0)' })).toBeInTheDocument();
  });

  it('a subscription on a deferred type counts toward nothing', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    h.subs = [subOn(DEFERRED_TYPE.key)];
    render(<NotificationManagementPage />);
    expect(statValue('Configured')).toHaveTextContent('0');
    expect(statValue('Unique emails')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'No recipients (1)' })).toBeInTheDocument();
    expect(within(rowOf(DEFERRED_TYPE.key)).queryByText('fleet-manager@example.test')).toBeNull();
  });

  it('a subscription on the live engine type counts toward nothing', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    h.subs = [subOn(LIVE_TYPE.key)];
    render(<NotificationManagementPage />);
    expect(statValue('Configured')).toHaveTextContent('0');
    expect(statValue('Unique emails')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'No recipients (1)' })).toBeInTheDocument();
    expect(within(rowOf(LIVE_TYPE.key)).queryByText('fleet-manager@example.test')).toBeNull();
  });

  it('a subscription on the legacy type counts as Configured and as a unique email', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    h.subs = [subOn(LEGACY_TYPE.key)];
    render(<NotificationManagementPage />);
    expect(statValue('Configured')).toHaveTextContent('1');
    expect(statValue('Unique emails')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'No recipients (0)' })).toBeInTheDocument();
    expect(within(rowOf(LEGACY_TYPE.key)).getByText(/fleet-manager@example\.test/)).toBeInTheDocument();
  });

  it('while email is not live the page says so, as a status (not an alert)', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    render(<NotificationManagementPage />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(EMAIL_NOT_LIVE_TITLE);
    expect(notice).toHaveTextContent(EMAIL_NOT_LIVE_DESCRIPTION);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('while email is not live a missing recipient carries no destructive tone', () => {
    h.types = [DEFERRED_TYPE, LIVE_TYPE, LEGACY_TYPE];
    render(<NotificationManagementPage />);
    const chip = screen.getByRole('button', { name: 'No recipients (1)' });
    expect(chip.className).not.toMatch(/destructive/);
    expect(statValue('No recipients').className).not.toMatch(/destructive/);
    const label = within(rowOf(LEGACY_TYPE.key)).getByText('No recipients');
    expect(label.className).not.toMatch(/destructive/);
    expect(label).toHaveClass('text-muted-foreground');

    // Still not destructive when the filter is active.
    fireEvent.click(chip);
    expect(screen.getByRole('button', { name: 'No recipients (1)' }).className).not.toMatch(/destructive/);
  });
});

describe('EditSubscriptionDrawer: engine types refused, honest toast (D-249)', () => {
  it('the drawer refuses to save a deferred type even if opened for one', () => {
    render(<EditSubscriptionDrawer type={DEFERRED_TYPE} existing={[]} open onClose={() => undefined} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(h.saveMutate).not.toHaveBeenCalled();
  });

  it('the drawer refuses to save the live engine type even if opened for one', () => {
    render(<EditSubscriptionDrawer type={LIVE_TYPE} existing={[]} open onClose={() => undefined} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(h.saveMutate).not.toHaveBeenCalled();
  });

  it('a legacy save says the recipients were saved and that email is not live yet', () => {
    h.saveMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    const onClose = vi.fn();
    render(<EditSubscriptionDrawer type={LEGACY_TYPE} existing={[]} open onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('email@company.com'), {
      target: { value: 'fleet-manager@example.test' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('email@company.com'), { key: 'Enter' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(h.saveMutate).toHaveBeenCalledTimes(1);
    expect(h.saveMutate.mock.calls[0][0]).toEqual({
      typeKey: LEGACY_TYPE.key,
      subscriptions: [
        {
          user_id: null,
          email: 'fleet-manager@example.test',
          vessel_scope: 'all',
          vessel_ids: [],
          channels: { in_app: true, email: true },
        },
      ],
    });
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast).toHaveBeenCalledWith({ title: 'Recipients saved', description: 'Email delivery is not live yet.' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
