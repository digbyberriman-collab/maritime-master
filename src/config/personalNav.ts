/**
 * The personal area's nav tree (gap/10 "Personal and global"; gap/01
 * "Personal area"; spec §8): the user's own account, notifications, work and
 * help, then the company settings their role may open. Every page has a URL
 * under `/me`, plus the inbox at `/inbox` and Help at `/help/*` (gap/10
 * Target IA principle 1), so a section is a link, a bookmark and a
 * breadcrumb like any other page.
 *
 *   ACCOUNT            Profile · Security · Signature (planned) · Appearance · Favourites · Sidebar layout
 *   NOTIFICATIONS      In-app · Channels & alerts
 *   MY WORK            Hours of rest · Training · Inbox · Documents (planned) · Leave (planned)
 *   DATA & HELP        Data & exports · How-to guides · Support
 *   COMPANY SETTINGS   the admin sections `canAccessSection` allows (placeholders planned)
 *
 * Inbox, How-to guides and Support link pages outside `/me` (`existing`), as
 * the inbox always has. `/help/support` is the one Support page: the Help
 * menu, the footer and the Coming Soon pages link it with `?subject=`, and
 * the old `/me/support` section URL redirects to it.
 *
 * `buildPersonalNav(canAccessSection)` takes the section gate (the settings
 * permissions for the user's role), so the sidebar shows only what the user
 * may open. The sitemap carries `buildPersonalNav(() => true)` in
 * `NAVIGATION_ITEMS` for titles and breadcrumbs only.
 *
 * The company settings stay under `/me` until gap/03 moves them to
 * `/fleet/admin`.
 */
import {
  Bell, BellRing, BookOpen, Clock, Database, Download, Eye, FileCheck, FileText, FileWarning, GraduationCap, Inbox,
  LayoutList, LifeBuoy, Lock, Mail, Palette, PenLine, Plane, Plug, CreditCard, ScrollText, Shield, Ship, Star, User, UserX,
  type LucideIcon,
} from 'lucide-react';
import { SETTINGS_SECTION_IDS, settingsSectionPath } from '@/shared/utils/settingsPermissions';
import type { NavChild } from './navigation-types';
import { L, LIVE, S, withScope } from './navBuilders';

/** The personal area's root. */
export const PERSONAL_BASE = '/me';

/** Where `/me` sends the user until the self-service hub exists (gap/01 landing). */
export const PERSONAL_HOME = '/me/profile';

/** The inbox (gap/10 `/inbox?tab=inbox|attention`), linked from the bell. */
export const INBOX_PATH = '/inbox';

interface CompanySetting {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A section with no real page yet: Coming Soon, hidden unless Show roadmap (D-06). */
  planned?: boolean;
}

/** The admin settings sections, in the order the old settings sidebar listed them. */
const COMPANY_SETTINGS: readonly CompanySetting[] = [
  { id: 'vessel-access', label: 'Vessel access', icon: Ship },
  { id: 'permissions', label: 'Permissions', icon: Lock },
  { id: 'audit-mode', label: 'Audit visibility', icon: Eye },
  { id: 'data-retention', label: 'Data retention & GDPR', icon: Database },
  { id: 'gdpr-requests', label: 'GDPR requests', icon: UserX },
  { id: 'insurance-audit', label: 'Insurance audit mode', icon: FileWarning },
  { id: 'hr-audit-access', label: 'HR audit access', icon: Lock },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'templates', label: 'Email templates', icon: Mail, planned: true },
  { id: 'compliance', label: 'Compliance', icon: FileCheck, planned: true },
  { id: 'billing', label: 'Billing', icon: CreditCard, planned: true },
  { id: 'logs', label: 'System logs', icon: ScrollText, planned: true },
];

const PLANNED = { status: 'planned' } as const;

/**
 * The personal tree. `canAccessSection(id)` decides the company settings
 * sections (a settings section id such as `permissions`); the user's own
 * sections are always listed.
 */
export function buildPersonalNav(canAccessSection: (id: string) => boolean): NavChild[] {
  const me = PERSONAL_BASE;
  const company = COMPANY_SETTINGS.filter((s) => canAccessSection(s.id)).map((s) =>
    L(s.label, me, { slug: s.id, icon: s.icon, ...(s.planned ? PLANNED : LIVE) }),
  );
  const tree: NavChild[] = [
    S('Account', me, [
      L('Profile', me, { icon: User, ...LIVE }),
      L('Security', me, { icon: Shield, ...LIVE }),
      L('Signature', me, { icon: PenLine, ...PLANNED }),
      L('Appearance', me, { icon: Palette, ...LIVE }),
      L('Favourites', me, { slug: 'shortcuts', icon: Star, ...LIVE }),
      L('Sidebar layout', me, { slug: 'sidebar-layout', icon: LayoutList, ...LIVE }),
    ]),
    S(
      'Notifications',
      me,
      [
        L('In-app', me, { slug: 'notifications', icon: Bell, ...LIVE }),
        L('Channels & alerts', `${me}/notifications`, { slug: 'channels', icon: BellRing, ...LIVE }),
      ],
      { slug: 'notifications-section' },
    ),
    S('My work', me, [
      L('Hours of rest', me, { slug: 'hours-of-rest', icon: Clock, ...LIVE }),
      L('Training', me, { icon: GraduationCap, ...LIVE }),
      L('Inbox', me, { existing: INBOX_PATH, icon: Inbox }),
      L('Documents', me, { icon: FileText, ...PLANNED }),
      L('Leave', me, { icon: Plane, ...PLANNED }),
    ]),
    S('Data & help', me, [
      L('Data & exports', me, { slug: 'data-exports', icon: Download, ...LIVE }),
      L('How-to guides', me, { existing: '/help/how-to-guides', icon: BookOpen }),
      L('Support', me, { existing: '/help/support', icon: LifeBuoy }),
    ]),
    ...(company.length ? [S('Company settings', me, company)] : []),
  ];
  return withScope(tree, 'personal');
}

/** A settings section's route inside `/me`: `path` relative to `/me`. */
export interface PersonalSettingsRoute {
  path: string;
  section: string;
}

const PLANNED_SECTIONS: ReadonlySet<string> = new Set(COMPANY_SETTINGS.filter((s) => s.planned).map((s) => s.id));

/**
 * Settings sections whose page is elsewhere: `support` is `/help/support`,
 * and `/me/support` (with `?tab=support` and `/settings/support`, which land
 * on it) redirects there, keeping the query.
 */
const SECTIONS_ELSEWHERE: ReadonlySet<string> = new Set(['support']);

/**
 * Every settings section with a real page under `/me`, as a route
 * (`profile`, `security`, …, `notifications/channels` for the notification
 * channels). The planned company settings open Coming Soon instead
 * (PERSONAL_PLACEHOLDER_LEAVES in the sitemap); Support is the Help page.
 */
export const PERSONAL_SETTINGS_ROUTES: readonly PersonalSettingsRoute[] = Object.freeze(
  SETTINGS_SECTION_IDS.filter((id) => !PLANNED_SECTIONS.has(id) && !SECTIONS_ELSEWHERE.has(id)).map((id) => ({
    path: settingsSectionPath(id).slice(PERSONAL_BASE.length + 1),
    section: id,
  })),
);
