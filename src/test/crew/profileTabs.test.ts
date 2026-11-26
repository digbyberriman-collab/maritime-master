/**
 * The crew profile's tab registry (X1-03; gap/04 C16; X1 spec §4): one
 * list the page renders from, each tab lazy, with its capability; which tabs
 * a viewer may open (server answer, else useCan with the same keys); where
 * an unknown or closed tab lands; the URL builder.
 */
import { describe, expect, it } from 'vitest';
import { isCapabilityKey } from '@/lib/permissions/types';
import { listCatalogueCapabilities } from '@/lib/permissions/catalogue';
import { CREW_CAPS } from '@/modules/crew/paths';
import {
  DEFAULT_PROFILE_TAB,
  PROFILE_TABS,
  PROFILE_TAB_COMPONENTS,
  PROFILE_TAB_KEYS,
  profilePath,
  profileTabFor,
  resolveProfileTab,
  visibleProfileTabs,
} from '@/modules/crew/lib/profileTabs';

describe('the registry', () => {
  it('lists Personal and Contact in this slice, Personal first (the default)', () => {
    expect(PROFILE_TABS.map((t) => [t.key, t.label])).toEqual([
      ['personal', 'Personal'],
      ['contact', 'Contact'],
    ]);
    expect(DEFAULT_PROFILE_TAB).toBe('personal');
    expect(PROFILE_TABS[0].key).toBe(DEFAULT_PROFILE_TAB);
  });

  it('knows every tab of the spec in display order, and builds only known ones, in that order', () => {
    expect(PROFILE_TAB_KEYS).toEqual(['personal', 'contact', 'documents', 'stcw', 'qualifications', 'training', 'hours-of-rest', 'employment', 'medical', 'activity']);
    const built = PROFILE_TABS.map((t) => t.key);
    expect(built.every((k) => PROFILE_TAB_KEYS.includes(k))).toBe(true);
    expect([...built].sort((a, b) => PROFILE_TAB_KEYS.indexOf(a) - PROFILE_TAB_KEYS.indexOf(b))).toEqual(built);
    expect(new Set(built).size).toBe(built.length);
  });

  it('gives each tab a catalogue capability, the own-profile rule and a lazy loader', () => {
    const catalogue = new Set(listCatalogueCapabilities());
    for (const tab of PROFILE_TABS) {
      expect(isCapabilityKey(tab.capability), tab.key).toBe(true);
      expect(catalogue.has(tab.capability), tab.key).toBe(true);
      expect(tab.capability).toBe(CREW_CAPS.profilesView);
      expect(tab.ownAlways).toBe(true);
      expect(typeof tab.load).toBe('function');
      expect(tab.load.length).toBe(0);
      // A dynamic import of the tab body under components/profile (one lazy chunk per tab).
      expect(String(tab.load)).toMatch(/import.*\/src\/modules\/crew\/components\/profile\/\w+Tab/);
      expect(PROFILE_TAB_COMPONENTS[tab.key], tab.key).toBeTruthy();
    }
  });

  it('profileTabFor answers built tabs only', () => {
    expect(profileTabFor('contact')?.label).toBe('Contact');
    expect(profileTabFor('documents')).toBeNull();
    expect(profileTabFor('nonsense')).toBeNull();
    expect(profileTabFor(null)).toBeNull();
  });
});

describe('profilePath', () => {
  it('builds the scope-relative URL, Personal by default', () => {
    expect(profilePath('b0000000-0000-4000-8000-000000000015')).toBe('crew/people/b0000000-0000-4000-8000-000000000015/personal');
    expect(profilePath('p-1', 'contact')).toBe('crew/people/p-1/contact');
    expect(profilePath('a/b')).toBe('crew/people/a%2Fb/personal');
  });
});

describe('visibleProfileTabs', () => {
  const none = () => false;
  const all = () => true;

  it('follows the server answer when there is one', () => {
    expect(visibleProfileTabs({ serverTabs: ['personal', 'contact', 'documents'], own: false, can: none }).map((t) => t.key)).toEqual(['personal', 'contact']);
    expect(visibleProfileTabs({ serverTabs: ['contact'], own: true, can: all }).map((t) => t.key)).toEqual(['contact']);
    expect(visibleProfileTabs({ serverTabs: [], own: true, can: all })).toEqual([]);
  });

  it('without it (D-01): the own profile always, else the capability', () => {
    expect(visibleProfileTabs({ serverTabs: null, own: true, can: none }).map((t) => t.key)).toEqual(['personal', 'contact']);
    expect(visibleProfileTabs({ serverTabs: null, own: false, can: (k) => k === CREW_CAPS.profilesView }).map((t) => t.key)).toEqual(['personal', 'contact']);
    expect(visibleProfileTabs({ serverTabs: null, own: false, can: none })).toEqual([]);
  });

  it('a module setting that is off closes a tab that names it', () => {
    const tabs = visibleProfileTabs({ serverTabs: null, own: true, can: all, moduleOn: () => false });
    // Neither built tab names a module setting, so both stay.
    expect(tabs.map((t) => t.key)).toEqual(['personal', 'contact']);
  });
});

describe('resolveProfileTab', () => {
  const visible = visibleProfileTabs({ serverTabs: null, own: true, can: () => true });

  it('the requested tab when it is open', () => {
    expect(resolveProfileTab('contact', visible)?.key).toBe('contact');
  });

  it('an unknown, missing or not-yet-built tab lands on Personal', () => {
    expect(resolveProfileTab('nonsense', visible)?.key).toBe('personal');
    expect(resolveProfileTab(null, visible)?.key).toBe('personal');
    expect(resolveProfileTab('documents', visible)?.key).toBe('personal');
  });

  it('the first open tab when Personal is closed, nothing when none is', () => {
    const contactOnly = visibleProfileTabs({ serverTabs: ['contact'], own: false, can: () => false });
    expect(resolveProfileTab('personal', contactOnly)?.key).toBe('contact');
    expect(resolveProfileTab('personal', [])).toBeNull();
  });
});
