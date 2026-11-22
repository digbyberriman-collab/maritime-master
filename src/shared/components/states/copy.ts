/**
 * Default copy for the shared page states (gap/10 §A.12; gap/00 D7).
 * Plain, specific sentences; pages pass their own title when they can say
 * more ("No permits yet", "Charter is switched off for Draak").
 */
import { AlertOctagon, Archive, Inbox, Lock, PowerOff, SearchX, type LucideIcon } from 'lucide-react';

export const EMPTY_STATE_KINDS = ['first-use', 'filtered', 'not-enabled', 'no-access', 'error'] as const;
export type EmptyStateKind = (typeof EMPTY_STATE_KINDS)[number];

export interface EmptyStateDefaults {
  icon: LucideIcon;
  title: string;
  body: string;
  /** ARIA role for the container: errors interrupt, filter results announce politely. */
  role?: 'alert' | 'status';
}

export const EMPTY_STATE_DEFAULTS: Readonly<Record<EmptyStateKind, EmptyStateDefaults>> = {
  'first-use': {
    icon: Inbox,
    title: 'Nothing here yet',
    body: 'Records you add will appear here.',
  },
  filtered: {
    icon: SearchX,
    title: 'Nothing matches these filters',
    body: 'Try fewer filters or a different search.',
    role: 'status',
  },
  'not-enabled': {
    icon: PowerOff,
    title: 'This module is switched off',
    body: 'An account admin can switch it on in Vessel Settings.',
  },
  'no-access': {
    icon: Lock,
    title: "You don't have access to this",
    body: 'Your role does not include it. If you think it should, ask your account admin.',
  },
  error: {
    icon: AlertOctagon,
    title: 'This page could not load',
    body: 'Try again. If it keeps happening, contact support with the reference below.',
    role: 'alert',
  },
};

export const ARCHIVED_ICON = Archive;

export const SLOW_LOADING_MESSAGE = 'Still loading. Large fleets can take a little longer.';
export const SLOW_LOADING_AFTER_MS = 3000;
