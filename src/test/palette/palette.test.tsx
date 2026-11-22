/**
 * Command palette behaviour (gap/10 IA12, BUILD-PLAN S5; spec §11.1, §12):
 * ⌘K / Ctrl+K from anywhere (fields too), Esc and focus return, accessible
 * dialog and listbox, fail-closed sources (Pages, Vessels, Recent), gated
 * actions, theme through useThemeChoice, the incident target, record
 * references that find nothing, and a lazy dialog chunk loaded once.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users } from 'lucide-react';
import type { VisibleNav } from '@/app/nav/useVisibleNav';
import { FAIL_CLOSED_NAV_ACCESS, NavAccessContext, type NavAccess } from '@/app/nav/navAccess';
import { ShellActionsContext, type ShellActions } from '@/app/shell/shellActions';
import { ScopeContext, type ScopeValue } from '@/app/router/scopeContext';
import { PALETTE_TEST_IDS } from '@/app/shell/testIds';
import { CommandPaletteProvider, preloadCommandPalette, useCommandPalette } from '@/shared/components/command-palette';
import { createPaletteLoader, type PaletteDialogModule } from '@/shared/components/command-palette/preload';
import { paletteRecentKey, PALETTE_RECENT_LIMIT, recordPaletteRecent } from '@/shared/components/command-palette/recent';
import { resolveVesselPattern } from '@/shared/components/command-palette/sources';
import type { Vessel } from '@/modules/vessels/contexts/VesselContext';

const h = vi.hoisted(() => ({
  nav: { ready: true, leaves: [] } as { ready: boolean; leaves: readonly unknown[] },
  access: { ready: true, signedIn: true, lastVesselCode: 'DRA' as string | null },
  vessels: [] as unknown[],
  codes: new Map<string, string>(),
  caps: new Set<string>(),
  theme: 'dark' as string | null,
  choose: vi.fn(async () => undefined),
  density: 'default',
  setDensity: vi.fn(),
  user: { id: 'user-1' } as { id: string } | null,
  signOut: vi.fn(async () => undefined),
  switchVessel: vi.fn(),
  feedbackOpen: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/app/nav/useVisibleNav', () => ({ useVisibleNavLeaves: () => h.nav }));
vi.mock('@/app/router/useScopeAccess', () => ({ useScopeAccess: () => h.access }));
vi.mock('@/app/nav/useVesselSwitch', () => ({ useVesselSwitch: () => h.switchVessel }));
vi.mock('@/app/shell/themeChoice', () => ({ useThemeChoice: () => ({ theme: h.theme, choose: h.choose }) }));
vi.mock('@/components/ui/use-density', () => ({ useDensity: () => [h.density, h.setDensity] }));
vi.mock('@/lib/permissions/useCan', () => ({ useCan: (key: string) => h.caps.has(key) }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, profile: h.user ? { id: 'profile-1', role: 'dpa' } : null, signOut: h.signOut }),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({ vessels: h.vessels, getVesselCodeById: (id: string | null | undefined) => (id ? h.codes.get(id) ?? null : null) }),
}));
vi.mock('@/modules/feedback/store/feedbackStore', () => ({
  useFeedbackStore: (select: (s: { setPanelOpen: (open: boolean) => void }) => unknown) => select({ setPanelOpen: h.feedbackOpen }),
}));

const vessel = (id: string, name: string, code: string, extra: Partial<Vessel> = {}): Vessel => {
  h.codes.set(id, code);
  return {
    id,
    company_id: 'company-1',
    name,
    imo_number: null,
    flag_state: null,
    vessel_type: null,
    classification_society: null,
    gross_tonnage: null,
    build_year: null,
    status: 'active',
    ...extra,
  };
};

const LEAVES: VisibleNav['leaves'] = [
  { id: 'fleet-dashboard', label: 'Dashboard', path: '/fleet/dashboard', icon: LayoutDashboard, scope: 'fleet', trail: ['Fleet', 'Overview'], crossLink: false },
  { id: 'crew-list', label: 'Crew list', path: '/v/:vesselCode/crew/list', icon: Users, scope: 'vessel', trail: ['Vessel', 'Crew'], crossLink: false },
  { id: 'crew-training', label: 'Training', path: '/fleet/training', icon: Users, scope: 'fleet', trail: ['Fleet', 'People'], crossLink: false },
];

let currentLocation = '';
const LocationProbe: React.FC = () => {
  const location = useLocation();
  currentLocation = `${location.pathname}${location.search}`;
  return null;
};

const OpenWithQuery: React.FC = () => {
  const palette = useCommandPalette();
  return (
    <button type="button" onClick={() => palette.open('crew')}>
      Search for crew
    </button>
  );
};

interface Setup {
  navAccess?: Partial<NavAccess>;
  shell?: ShellActions;
  scope?: ScopeValue;
  nested?: boolean;
}

function renderPalette({ navAccess = {}, shell = {}, scope = { scope: 'fleet' }, nested = false }: Setup = {}) {
  const access: NavAccess = {
    ...FAIL_CLOSED_NAV_ACCESS,
    ready: true,
    can: () => true,
    fleetReach: true,
    vesselReach: true,
    ...navAccess,
  };
  const body = (
    <>
      <button type="button">Opener</button>
      <input aria-label="Notes" />
      <OpenWithQuery />
      <LocationProbe />
    </>
  );
  return render(
    <MemoryRouter initialEntries={['/fleet/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NavAccessContext.Provider value={access}>
        <ShellActionsContext.Provider value={shell}>
          <ScopeContext.Provider value={scope}>
            <CommandPaletteProvider>
              {nested ? <CommandPaletteProvider>{body}</CommandPaletteProvider> : body}
            </CommandPaletteProvider>
          </ScopeContext.Provider>
        </ShellActionsContext.Provider>
      </NavAccessContext.Provider>
    </MemoryRouter>,
  );
}

const pressPaletteKey = (target: Element | Window = document.activeElement ?? document.body, init: KeyboardEventInit = { ctrlKey: true }) => {
  const event = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

async function openPalette() {
  pressPaletteKey();
  return screen.findByRole('dialog', { name: 'Search STORM' });
}

const typeQuery = (text: string) => {
  fireEvent.change(screen.getByTestId(PALETTE_TEST_IDS.input), { target: { value: text } });
};

const optionNames = (dialog: HTMLElement) => within(dialog).queryAllByRole('option').map((o) => o.textContent ?? '');

const groupByHeading = (dialog: HTMLElement, heading: string) =>
  [...dialog.querySelectorAll<HTMLElement>('[cmdk-group]')].find(
    (group) => group.querySelector('[cmdk-group-heading]')?.textContent === heading,
  ) ?? null;

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  h.nav = { ready: true, leaves: LEAVES };
  h.access = { ready: true, signedIn: true, lastVesselCode: 'DRA' };
  h.codes.clear();
  h.vessels = [
    vessel('v-dra', 'DRAAK', 'DRA', { vessel_type: 'Motor yacht', flag_state: 'Cayman Islands', imo_number: '9781235' }),
    vessel('v-hyd', 'HYDRA', 'HYD'),
  ];
  h.caps = new Set();
  h.theme = 'dark';
  h.density = 'default';
  h.user = { id: 'user-1' };
  h.choose.mockClear();
  h.setDensity.mockClear();
  h.signOut.mockClear();
  h.switchVessel.mockClear();
  h.feedbackOpen.mockClear();
  window.localStorage.clear();
  currentLocation = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('opening and closing', () => {
  it('opens with Ctrl+K and with ⌘K, and claims the key', async () => {
    renderPalette();
    expect(screen.queryByRole('dialog')).toBeNull();
    const event = pressPaletteKey();
    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Search STORM' })).toBeInTheDocument();
    // Ctrl+K again toggles it shut.
    pressPaletteKey(screen.getByTestId(PALETTE_TEST_IDS.input));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    pressPaletteKey(document.body, { metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Search STORM' })).toBeInTheDocument();
  });

  it('opens from inside a text field', async () => {
    renderPalette();
    const field = screen.getByRole('textbox', { name: 'Notes' });
    field.focus();
    const event = pressPaletteKey(field);
    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Search STORM' })).toBeInTheDocument();
  });

  it('leaves other keys, and a K another handler took, alone', async () => {
    renderPalette();
    const plain = pressPaletteKey(document.body, { ctrlKey: false });
    expect(plain.defaultPrevented).toBe(false);
    const shifted = pressPaletteKey(document.body, { ctrlKey: true, shiftKey: true });
    expect(shifted.defaultPrevented).toBe(false);
    const field = screen.getByRole('textbox', { name: 'Notes' });
    field.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
    pressPaletteKey(field);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc closes and focus returns to the element that opened it', async () => {
    renderPalette();
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    const dialog = await openPalette();
    await waitFor(() => expect(within(dialog).getByTestId(PALETTE_TEST_IDS.input)).toHaveFocus());
    fireEvent.keyDown(within(dialog).getByTestId(PALETTE_TEST_IDS.input), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('open(query) types the query in', async () => {
    renderPalette();
    fireEvent.click(screen.getByRole('button', { name: 'Search for crew' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search STORM' });
    expect(within(dialog).getByTestId(PALETTE_TEST_IDS.input)).toHaveValue('crew');
  });

  it('a nested provider mounts no second listener or dialog', async () => {
    renderPalette({ nested: true });
    await openPalette();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('accessibility', () => {
  it('the dialog, search field and results are named; results are a listbox of options', async () => {
    renderPalette();
    const dialog = await openPalette();
    expect(dialog).toHaveAttribute('data-testid', PALETTE_TEST_IDS.dialog);
    expect(within(dialog).getByRole('combobox', { name: 'Search STORM' })).toBe(within(dialog).getByTestId(PALETTE_TEST_IDS.input));
    const list = within(dialog).getByRole('listbox', { name: 'Search results' });
    expect(list).toHaveAttribute('data-testid', PALETTE_TEST_IDS.list);
    expect(within(list).getAllByRole('option').length).toBeGreaterThan(0);
    expect(list.className).toContain('max-h-[min(28rem,70dvh)]');
  });

  it('arrow keys move the highlighted option and Enter opens it', async () => {
    renderPalette();
    const dialog = await openPalette();
    const input = within(dialog).getByTestId(PALETTE_TEST_IDS.input);
    const first = within(dialog).getAllByRole('option')[0];
    await waitFor(() => expect(first).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = within(dialog).getAllByRole('option')[1];
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second.textContent).toContain('Training');
    fireEvent.keyDown(input, { key: 'End' });
    expect(within(dialog).getAllByRole('option').at(-1)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Home' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(currentLocation).toBe('/fleet/training'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Pages', () => {
  it('lists only the visible nav leaves, with their trail, and filters them fuzzily', async () => {
    renderPalette();
    const dialog = await openPalette();
    const pages = groupByHeading(dialog, 'Pages');
    expect(pages).not.toBeNull();
    const names = within(pages as HTMLElement).getAllByRole('option').map((o) => o.textContent);
    // Before anything is typed, the current scope's pages come first (fleet here).
    expect(names).toEqual(['DashboardFleet › Overview', 'TrainingFleet › People', 'Crew listVessel › Crew']);
    typeQuery('crew');
    await waitFor(() => expect(optionNames(dialog).some((n) => n.startsWith('Dashboard'))).toBe(false));
    expect(optionNames(dialog)[0]).toContain('Crew list');
  });

  it('suggests a few pages before anything is typed and searches them all', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `leaf-${i}`,
      label: `Register ${i}`,
      path: `/v/:vesselCode/register-${i}`,
      icon: Users,
      scope: 'vessel' as const,
      trail: ['Vessel', 'Registers'],
      crossLink: false,
    }));
    h.nav = { ready: true, leaves: [...LEAVES, ...many] };
    renderPalette({ scope: { scope: 'vessel', vesselCode: 'DRA' } });
    const dialog = await openPalette();
    const pages = groupByHeading(dialog, 'Pages') as HTMLElement;
    const names = within(pages).getAllByRole('option').map((o) => o.textContent ?? '');
    expect(names).toHaveLength(5);
    // Vessel pages first in the vessel scope.
    expect(names[0]).toContain('Crew list');
    expect(names.every((n) => n.includes('Vessel ›'))).toBe(true);
    expect(within(pages).getByText('7 more pages: type to search them')).toBeInTheDocument();
    // Vessels and Actions stay in view.
    expect(groupByHeading(dialog, 'Vessels')).not.toBeNull();
    expect(groupByHeading(dialog, 'Actions')).not.toBeNull();
    typeQuery('register 8');
    expect(await within(dialog).findByRole('option', { name: /Register 8/ })).toBeInTheDocument();
    expect(within(dialog).queryByText(/more pages/)).toBeNull();
  });

  it('fails closed while the nav is not ready: one skeleton row, no pages', async () => {
    h.nav = { ready: false, leaves: [] };
    renderPalette();
    const dialog = await openPalette();
    const pages = groupByHeading(dialog, 'Pages') as HTMLElement;
    expect(pages).not.toBeNull();
    expect(within(pages).queryAllByRole('option')).toHaveLength(0);
    expect(within(pages).getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(within(pages).getByText('Loading pages')).toBeInTheDocument();
    typeQuery('dash');
    expect(within(dialog).queryByRole('option', { name: /Dashboard/ })).toBeNull();
  });

  it('opens a /v/:vesselCode leaf on the current vessel', async () => {
    renderPalette({ scope: { scope: 'vessel', vesselCode: 'HYD' } });
    const dialog = await openPalette();
    fireEvent.click(within(dialog).getByRole('option', { name: /Crew list/ }));
    await waitFor(() => expect(currentLocation).toBe('/v/hyd/crew/list'));
  });

  it('resolveVesselPattern only rewrites the literal vessel prefix', () => {
    expect(resolveVesselPattern('/v/:vesselCode/crew/list', 'DRA')).toBe('/v/dra/crew/list');
    expect(resolveVesselPattern('/v/:vesselCode', 'DRA')).toBe('/v/dra');
    expect(resolveVesselPattern('/v/:vesselCode?tab=x', 'DRA')).toBe('/v/dra?tab=x');
    expect(resolveVesselPattern('/v/:vesselCodeX/crew', 'DRA')).toBe('/v/:vesselCodeX/crew');
    expect(resolveVesselPattern('/fleet/dashboard', 'DRA')).toBe('/fleet/dashboard');
    expect(resolveVesselPattern('/v/:vesselCode/crew/list', null)).toBe('/v/:vesselCode/crew/list');
  });
});

describe('Vessels', () => {
  it('lists the vessels in reach with their codes, and "All vessels" with fleet reach', async () => {
    renderPalette();
    const dialog = await openPalette();
    const vessels = groupByHeading(dialog, 'Vessels') as HTMLElement;
    const names = within(vessels).getAllByRole('option').map((o) => o.textContent);
    expect(names[0]).toBe('All vessels — Fleet overview');
    expect(names[1]).toContain('DRAAK');
    expect(names[1]).toContain('DRA');
    expect(names[1]).toContain('Motor yacht · Cayman Islands');
    expect(names[2]).toContain('HYDRA');
    fireEvent.click(within(vessels).getByRole('option', { name: /All vessels/ }));
    await waitFor(() => expect(currentLocation).toBe('/fleet/dashboard'));
  });

  it('no "All vessels" without fleet reach', async () => {
    renderPalette({ navAccess: { fleetReach: false } });
    const dialog = await openPalette();
    expect(within(dialog).queryByRole('option', { name: /All vessels/ })).toBeNull();
    expect(within(dialog).getByRole('option', { name: /HYDRA/ })).toBeInTheDocument();
  });

  it('finds a vessel by code or IMO number and switches through useVesselSwitch', async () => {
    renderPalette();
    const dialog = await openPalette();
    typeQuery('9781235');
    const option = await within(dialog).findByRole('option', { name: /DRAAK/ });
    typeQuery('hyd');
    fireEvent.click(await within(dialog).findByRole('option', { name: /HYDRA/ }));
    expect(h.switchVessel).toHaveBeenCalledWith({ id: 'v-hyd', code: 'HYD' });
    expect(option).toBeDefined();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the best match is the first option even when an earlier group also matches', async () => {
    h.nav = {
      ready: true,
      leaves: [
        ...LEAVES,
        { id: 'history', label: 'Incident & Treatment History', path: '/health/history', icon: Users, scope: 'workspace', trail: ['Health & Wellness', 'Medical', 'Personnel Medical Data'], crossLink: false },
      ],
    };
    renderPalette();
    const dialog = await openPalette();
    typeQuery('hyd');
    await waitFor(() => expect(within(dialog).getAllByRole('option')[0].textContent).toContain('HYDRA'));
    await waitFor(() => expect(within(dialog).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true'));
    // The weaker page match is still offered, below.
    expect(optionNames(dialog).some((n) => n.startsWith('Incident & Treatment History'))).toBe(true);
    fireEvent.keyDown(within(dialog).getByTestId(PALETTE_TEST_IDS.input), { key: 'Enter' });
    expect(h.switchVessel).toHaveBeenCalledWith({ id: 'v-hyd', code: 'HYD' });
  });

  it('marks the vessel in scope as current', async () => {
    renderPalette({ scope: { scope: 'vessel', vesselCode: 'DRA' } });
    const dialog = await openPalette();
    expect(within(dialog).getByRole('option', { name: /DRAAK/ }).textContent).toContain('Current');
    expect(within(dialog).getByRole('option', { name: /HYDRA/ }).textContent).not.toContain('Current');
  });

  it('fails closed until access is ready: a skeleton row and no vessels', async () => {
    h.access = { ready: false, signedIn: true, lastVesselCode: null };
    renderPalette();
    const dialog = await openPalette();
    const vessels = groupByHeading(dialog, 'Vessels') as HTMLElement;
    expect(within(vessels).queryAllByRole('option')).toHaveLength(0);
    expect(within(vessels).getByText('Loading vessels')).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: /All vessels/ })).toBeNull();
  });
});

describe('Actions', () => {
  it('hides shell actions the shell does not offer', async () => {
    renderPalette();
    const dialog = await openPalette();
    expect(within(dialog).queryByRole('option', { name: /Open notifications/ })).toBeNull();
    expect(within(dialog).queryByRole('option', { name: /Keyboard shortcuts/ })).toBeNull();
    expect(within(dialog).getByRole('option', { name: /Report a problem/ })).toBeInTheDocument();
  });

  it('Open notifications closes the palette first, then opens the bell on the next frame', async () => {
    const order: string[] = [];
    const openNotifications = vi.fn(() => {
      order.push(screen.queryByRole('dialog') ? 'palette open' : 'palette closed');
    });
    renderPalette({ shell: { openNotifications } });
    const dialog = await openPalette();
    fireEvent.click(within(dialog).getByRole('option', { name: /Open notifications/ }));
    expect(openNotifications).not.toHaveBeenCalled();
    await waitFor(() => expect(openNotifications).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['palette closed']);
  });

  it('Keyboard shortcuts and Report a problem open their surfaces', async () => {
    const openKeyboardShortcuts = vi.fn();
    renderPalette({ shell: { openKeyboardShortcuts } });
    let dialog = await openPalette();
    fireEvent.click(within(dialog).getByRole('option', { name: /Keyboard shortcuts/ }));
    await waitFor(() => expect(openKeyboardShortcuts).toHaveBeenCalledTimes(1));
    dialog = await openPalette();
    fireEvent.click(within(dialog).getByRole('option', { name: /Report a problem/ }));
    await waitFor(() => expect(h.feedbackOpen).toHaveBeenCalledWith(true));
  });

  it('Report an incident needs the capability and a vessel in reach, and opens /incidents?new=true', async () => {
    const first = renderPalette();
    let dialog = await openPalette();
    expect(within(dialog).queryByRole('option', { name: /Report an incident/ })).toBeNull();
    first.unmount();

    h.caps = new Set(['vessel.safety.incidents.create']);
    const second = renderPalette({ navAccess: { vesselReach: false } });
    dialog = await openPalette();
    expect(within(dialog).queryByRole('option', { name: /Report an incident/ })).toBeNull();
    second.unmount();

    renderPalette();
    dialog = await openPalette();
    fireEvent.click(within(dialog).getByRole('option', { name: /Report an incident/ }));
    await waitFor(() => expect(currentLocation).toBe('/incidents?new=true'));
  });

  it('theme actions go through useThemeChoice and mark the theme in use', async () => {
    renderPalette();
    const dialog = await openPalette();
    expect(within(dialog).getByRole('option', { name: /Theme: Abyss/ }).textContent).toContain('(in use)');
    fireEvent.click(within(dialog).getByRole('option', { name: /Theme: Daylight/ }));
    await waitFor(() => expect(h.choose).toHaveBeenCalledWith('light'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('density actions set the device density', async () => {
    renderPalette();
    const dialog = await openPalette();
    fireEvent.click(within(dialog).getByRole('option', { name: /Density: Compact/ }));
    await waitFor(() => expect(h.setDensity).toHaveBeenCalledWith('compact'));
  });

  it('Sign out signs out, then goes to /auth', async () => {
    renderPalette();
    const dialog = await openPalette();
    fireEvent.click(within(dialog).getByRole('option', { name: /Sign out/ }));
    await waitFor(() => expect(h.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(currentLocation).toBe('/auth'));
  });
});

describe('Recent', () => {
  it('remembers picks per user on this device and shows them first', async () => {
    renderPalette();
    let dialog = await openPalette();
    expect(groupByHeading(dialog, 'Recent')).toBeNull();
    fireEvent.click(within(dialog).getByRole('option', { name: /Training/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(JSON.parse(window.localStorage.getItem(paletteRecentKey('user-1')) ?? '[]')).toEqual(['page:/fleet/training']);
    expect(window.localStorage.getItem(paletteRecentKey('user-2'))).toBeNull();

    dialog = await openPalette();
    const recent = groupByHeading(dialog, 'Recent') as HTMLElement;
    expect(within(recent).getAllByRole('option').map((o) => o.textContent)).toEqual(['TrainingFleet › People']);
    // Typing hides Recent (the same item is in Pages).
    typeQuery('train');
    await waitFor(() => expect(groupByHeading(dialog, 'Recent')).toBeNull());
  });

  it('shows only items that are still offered, and nothing while sources load', async () => {
    recordPaletteRecent('user-1', 'page:/fleet/gone');
    recordPaletteRecent('user-1', 'vessel:v-hyd');
    recordPaletteRecent('user-1', 'action:open-notifications');
    h.nav = { ready: false, leaves: [] };
    const first = renderPalette();
    let dialog = await openPalette();
    expect(groupByHeading(dialog, 'Recent')).toBeNull();
    first.unmount();

    h.nav = { ready: true, leaves: LEAVES };
    renderPalette();
    dialog = await openPalette();
    const recent = groupByHeading(dialog, 'Recent') as HTMLElement;
    // The withdrawn page and the unavailable notifications action are dropped.
    expect(within(recent).getAllByRole('option').map((o) => o.textContent)).toEqual(['HYDRAHYD']);
  });

  it('keeps at most six, newest first, and survives broken storage', () => {
    for (let i = 0; i < 9; i += 1) recordPaletteRecent('user-1', `page:/p${i}`);
    const stored = JSON.parse(window.localStorage.getItem(paletteRecentKey('user-1')) ?? '[]');
    expect(stored).toHaveLength(PALETTE_RECENT_LIMIT);
    expect(stored[0]).toBe('page:/p8');
    window.localStorage.setItem(paletteRecentKey('user-1'), '{not json');
    expect(recordPaletteRecent('user-1', 'page:/x')).toEqual(['page:/x']);
    expect(recordPaletteRecent(null, 'page:/x')).toEqual([]);
  });
});

describe('Records', () => {
  it('a reference query finds nothing in Phase 1 and says so', async () => {
    renderPalette();
    const dialog = await openPalette();
    typeQuery('ptw-dra-2026-061');
    const records = await waitFor(() => {
      const group = groupByHeading(dialog, 'Records');
      expect(group).not.toBeNull();
      return group as HTMLElement;
    });
    expect(await within(records).findByText(/No record matches/)).toHaveTextContent('No record matches PTW-DRA-2026-061');
    expect(within(records).queryAllByRole('option')).toHaveLength(0);
    expect(within(dialog).queryByText(/No results for/)).toBeNull();
  });

  it('an ordinary query shows no Records group', async () => {
    renderPalette();
    const dialog = await openPalette();
    typeQuery('zzzz');
    await waitFor(() => expect(within(dialog).getByText(/No results for/)).toBeInTheDocument());
    expect(groupByHeading(dialog, 'Records')).toBeNull();
  });
});

describe('lazy dialog chunk', () => {
  it('preloadCommandPalette never throws, with or without a provider', () => {
    expect(() => {
      preloadCommandPalette();
      preloadCommandPalette();
    }).not.toThrow();
  });

  it('a loader imports the chunk once for any number of preloads and loads', async () => {
    const module: PaletteDialogModule = { default: () => null };
    const importer = vi.fn(async () => module);
    const loader = createPaletteLoader(importer);
    loader.preload();
    loader.preload();
    await expect(loader.load()).resolves.toBe(module);
    loader.preload();
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('a failed import is retried on the next load, and a preload never rejects or throws', async () => {
    const module: PaletteDialogModule = { default: () => null };
    const importer = vi
      .fn<() => Promise<PaletteDialogModule>>()
      .mockImplementationOnce(() => {
        throw new Error('sync failure');
      })
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValue(module);
    const loader = createPaletteLoader(importer);
    expect(() => loader.preload()).not.toThrow();
    await Promise.resolve();
    await expect(loader.load()).rejects.toThrow('chunk failed');
    await expect(loader.load()).resolves.toBe(module);
    expect(importer).toHaveBeenCalledTimes(3);
  });
});
