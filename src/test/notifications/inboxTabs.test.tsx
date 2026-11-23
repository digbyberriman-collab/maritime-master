/**
 * The /inbox URL and the old Notification Center redirect (gap/10 IA15
 * `/inbox?tab=inbox|attention`; gap/03 legacy table; D-62, D-27), and how an
 * inbox row reads (severity tones, place, module labels).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  activeInboxTab,
  attentionViewFrom,
  inboxFiltersFrom,
  notificationCenterTarget,
  requestedInboxTab,
} from '@/modules/notifications/lib/inboxTabs';
import NotificationCenterRedirect from '@/modules/notifications/components/NotificationCenterRedirect';
import {
  INBOX_MODULE_KEYS,
  INBOX_SEVERITY_META,
  inboxModuleLabel,
  inboxPlace,
  inboxSeverityMeta,
} from '@/modules/notifications/lib/inboxPresentation';
import { appRouteObjects, describeRouteTree } from '@/test/router/routeHarness';

describe('requestedInboxTab', () => {
  it('reads all / attention / archived, inbox as All, and the old Notification Center tabs as Attention', () => {
    expect(requestedInboxTab('all')).toBe('all');
    expect(requestedInboxTab('inbox')).toBe('all');
    expect(requestedInboxTab('attention')).toBe('attention');
    expect(requestedInboxTab('archived')).toBe('archived');
    for (const old of ['compliance', 'messages', 'tasks']) expect(requestedInboxTab(old)).toBe('attention');
    for (const other of [null, '', 'ALL', 'unknown', 'toString']) expect(requestedInboxTab(other)).toBeNull();
  });
});

describe('activeInboxTab', () => {
  it('a requested tab wins, whatever the inbox state', () => {
    for (const state of ['table', 'table-missing', 'unknown', 'error'] as const) {
      expect(activeInboxTab('archived', state)).toBe('archived');
    }
  });

  it('no tab: All once the inbox exists (or failed), Attention while it is missing, nothing while unknown', () => {
    expect(activeInboxTab(null, 'table')).toBe('all');
    expect(activeInboxTab(null, 'error')).toBe('all');
    expect(activeInboxTab(null, 'table-missing')).toBe('attention');
    expect(activeInboxTab(null, 'unknown')).toBeNull();
  });
});

describe('attentionViewFrom', () => {
  it('reads view, then an old tab, default compliance', () => {
    expect(attentionViewFrom(new URLSearchParams('view=tasks'))).toBe('tasks');
    expect(attentionViewFrom(new URLSearchParams('tab=messages'))).toBe('messages');
    expect(attentionViewFrom(new URLSearchParams('tab=messages&view=tasks'))).toBe('tasks');
    expect(attentionViewFrom(new URLSearchParams('tab=attention'))).toBe('compliance');
    expect(attentionViewFrom(new URLSearchParams('view=nope'))).toBe('compliance');
  });
});

describe('inboxFiltersFrom', () => {
  it('keeps known scopes only, and trims the vessel and module', () => {
    expect(inboxFiltersFrom(new URLSearchParams('scope=fleet&vessel=%20dra%20&module=crew'))).toEqual({ scope: 'fleet', vessel: 'dra', module: 'crew' });
    expect(inboxFiltersFrom(new URLSearchParams('scope=company&vessel=&module=%20'))).toEqual({ scope: null, vessel: null, module: null });
    for (const scope of ['vessel', 'workspace', 'personal']) expect(inboxFiltersFrom(new URLSearchParams(`scope=${scope}`)).scope).toBe(scope);
  });
});

describe('notificationCenterTarget', () => {
  it('opens Attention, keeps the query and hash, and turns an old tab into view', () => {
    expect(notificationCenterTarget('', '')).toBe('/inbox?tab=attention');
    expect(notificationCenterTarget('?tab=compliance', '')).toBe('/inbox?tab=attention&view=compliance');
    expect(notificationCenterTarget('?tab=tasks&id=a1', '#row')).toBe('/inbox?tab=attention&id=a1&view=tasks#row');
    expect(notificationCenterTarget('?id=a1', '')).toBe('/inbox?tab=attention&id=a1');
    // An unknown old tab is dropped (the target's tab wins).
    expect(notificationCenterTarget('?tab=bogus', '')).toBe('/inbox?tab=attention');
    // An explicit view wins over the old tab.
    expect(notificationCenterTarget('?tab=tasks&view=messages', '')).toBe('/inbox?tab=attention&view=messages');
  });
});

function Location() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}|${JSON.stringify(location.state)}`}</output>;
}

describe('NotificationCenterRedirect', () => {
  it('replaces /notifications/center with the Attention tab, keeping the query, hash and state', () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/notifications/center', search: '?tab=messages&id=x', hash: '#top', state: { from: 'badge' } }]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/notifications/center" element={<NotificationCenterRedirect />} />
          <Route path="/inbox" element={<p>Inbox</p>} />
        </Routes>
        <Location />
      </MemoryRouter>,
    );
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/inbox?tab=attention&id=x&view=messages#top|{"from":"badge"}');
  });

  it('is wired in the router, and /inbox renders the inbox page', () => {
    const lines = describeRouteTree(appRouteObjects());
    expect(lines).toContain('/notifications/center :: <NotificationCenterRedirect>');
    expect(lines.find((l) => l.startsWith('/inbox ['))).toMatch(/page\(\/src\/modules\/notifications\/pages\/InboxPage\.tsx\) guard=ProtectedRoute/);
    expect(lines.join('\n')).not.toMatch(/NotificationCenterPage/);
  });
});

describe('inbox presentation', () => {
  it('maps severity to one tone each (critical is danger, D-57; nothing uses accent, D-34)', () => {
    expect(Object.fromEntries(Object.entries(INBOX_SEVERITY_META).map(([k, v]) => [k, [v.tone, v.label]]))).toEqual({
      critical: ['danger', 'Critical'],
      warning: ['warn', 'Warning'],
      info: ['signal', 'Info'],
      success: ['ok', 'Success'],
    });
    expect(Object.isFrozen(INBOX_SEVERITY_META)).toBe(true);
    expect(inboxSeverityMeta('bogus_value')).toMatchObject({ tone: 'neutral', label: 'Bogus value' });
    expect(inboxSeverityMeta('constructor')).toMatchObject({ tone: 'neutral' });
    expect(inboxSeverityMeta(null)).toMatchObject({ tone: 'neutral', label: 'Unknown' });
  });

  it('says where a row belongs', () => {
    const names = (id: string) => (id === 'v-dra' ? 'Draak' : null);
    const base = { link_vessel_code: null, link_workspace: null, vessel_id: null };
    expect(inboxPlace({ ...base, link_scope: 'vessel', vessel_id: 'v-dra', link_vessel_code: 'DRA' }, names)).toBe('Draak');
    expect(inboxPlace({ ...base, link_scope: 'vessel', vessel_id: 'v-x', link_vessel_code: 'GAM' }, names)).toBe('GAM');
    expect(inboxPlace({ ...base, link_scope: 'vessel' }, names)).toBe('Vessel');
    expect(inboxPlace({ ...base, link_scope: 'fleet' }, names)).toBe('Fleet');
    expect(inboxPlace({ ...base, link_scope: 'workspace', link_workspace: 'hris' }, names)).toBe('HRIS');
    expect(inboxPlace({ ...base, link_scope: 'workspace', link_workspace: 'legal' }, names)).toBe('Legal');
    expect(inboxPlace({ ...base, link_scope: 'workspace' }, names)).toBe('Workspace');
    expect(inboxPlace({ ...base, link_scope: 'personal' }, names)).toBe('Personal');
  });

  it('labels modules from the vessel tabs and the workspaces, and humanises the rest', () => {
    expect(INBOX_MODULE_KEYS).toEqual(expect.arrayContaining(['crew', 'safety', 'technical', 'hris', 'health', 'yard', 'legal']));
    expect(INBOX_MODULE_KEYS).not.toContain('home');
    expect(inboxModuleLabel('safety')).toBe('Safety');
    expect(inboxModuleLabel('hris')).toBe('HRIS');
    expect(inboxModuleLabel('people_ops')).toBe('People ops');
    expect(inboxModuleLabel(null)).toBeNull();
  });
});
