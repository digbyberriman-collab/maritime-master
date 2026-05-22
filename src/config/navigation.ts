import {
  Home,
  Map as MapIcon,
  Users,
  Shield,
  Wrench,
  BookOpen,
  Settings as SettingsIcon,
  Siren,
  BarChart3,
  Anchor,
  Package,
  type LucideIcon,
} from 'lucide-react';

// =====================================================================
// Navigation — single source of truth for sidebar + smart tab bar.
// Structure: 9 functional DOMAINS + pinned Emergency + hidden Insights.
// Each domain renders a workspace; sub-nav is HORIZONTAL TABS in the
// content header (never nested sidebar menus). Top-level identifiers
// drive both the sidebar items and the tabs the SmartTabBar surfaces.
// =====================================================================

export type NavPhase = 1 | 2;

export type NavRole =
  | 'master'
  | 'chief_engineer'
  | 'chief_officer'
  | 'crew'
  | 'dpa'
  | 'shore_management';

/** A tab inside a domain workspace. Renders in the SmartTabBar. */
export interface NavTab {
  id: string;
  label: string;
  /** Canonical path. Active state uses pathname startsWith + this path. */
  path: string;
  icon?: LucideIcon;
  /** When set, the tab is only visible to users with one of these roles. */
  requiredRoles?: NavRole[];
  /** Phase 2 tabs are hidden behind the FEATURE_INSIGHTS flag for now. */
  phase?: NavPhase;
  /** Optional badge text rendered next to the label (e.g. "New"). */
  badge?: string;
}

/** A top-level functional domain in the sidebar. */
export interface NavDomain {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Default landing path when the domain item is clicked. */
  path: string;
  /**
   * Legacy module key passed to `canAccessModule` for role-based visibility.
   * Defaults to the domain `id` if omitted. Charter & Guest and Procurement
   * have no existing module key and fall through to `userRole`-only filters.
   */
  moduleId?: string;
  /** When set, the domain is only visible to users with one of these roles. */
  requiredRoles?: NavRole[];
  /** Pinned items render in a separate footer slot in the sidebar. */
  pinned?: 'bottom';
  /** Phase 2 domains are hidden behind a feature flag. */
  phase?: NavPhase;
  /** Tabs rendered by the SmartTabBar when this domain is active. */
  tabs: NavTab[];
}

// =====================================================================
// Domains
// =====================================================================

export const NAV_DOMAINS: NavDomain[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    path: '/home',
    moduleId: 'dashboard',
    tabs: [
      { id: 'today', label: 'Today', path: '/home' },
      { id: 'approvals', label: 'Approvals', path: '/home/approvals' },
      { id: 'alerts', label: 'Alerts', path: '/home/alerts' },
      {
        id: 'dpa',
        label: 'DPA',
        path: '/home/dpa',
        requiredRoles: ['dpa', 'shore_management'],
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: MapIcon,
    path: '/operations/map',
    tabs: [
      { id: 'map', label: 'Map', path: '/operations/map', requiredRoles: ['dpa', 'shore_management', 'master', 'chief_officer'] },
      { id: 'itinerary', label: 'Itinerary', path: '/operations/itinerary' },
      { id: 'voyage-planning', label: 'Voyage Planning', path: '/operations/voyage-planning' },
      { id: 'port-calls', label: 'Port Calls', path: '/operations/port-calls', phase: 2 },
      { id: 'weather', label: 'Weather', path: '/operations/weather', phase: 2 },
      { id: 'fuel', label: 'Fuel & Consumption', path: '/operations/fuel', phase: 2 },
      { id: 'guest-movements', label: 'Guest Movements', path: '/operations/guest-movements', phase: 2 },
      { id: 'flight-tracking', label: 'Flight Tracking', path: '/operations/flight-tracking', phase: 2 },
      { id: 'logistics', label: 'Logistics', path: '/operations/logistics', phase: 2 },
      { id: 'fleet-timeline', label: 'Fleet Timeline', path: '/operations/fleet-timeline' },
    ],
  },
  {
    id: 'crew',
    label: 'Crew',
    icon: Users,
    path: '/crew/list',
    tabs: [
      { id: 'list', label: 'Crew List', path: '/crew/list', requiredRoles: ['dpa', 'shore_management', 'master', 'chief_officer'] },
      { id: 'certificates', label: 'Certificates & Competency', path: '/crew/certificates' },
      { id: 'hours-of-rest', label: 'Hours of Rest', path: '/crew/hours-of-rest' },
      { id: 'leave', label: 'Leave & Rotations', path: '/crew/leave' },
      { id: 'performance', label: 'Performance', path: '/crew/performance', phase: 2 },
      { id: 'medical', label: 'Medical', path: '/crew/medical', phase: 2 },
      { id: 'recruitment', label: 'Recruitment', path: '/crew/recruitment', phase: 2 },
      { id: 'training', label: 'Training', path: '/crew/training' },
      { id: 'welfare', label: 'Welfare', path: '/crew/welfare', phase: 2 },
      { id: 'travel-visa', label: 'Travel & Visa', path: '/crew/travel-visa' },
      { id: 'acknowledgements', label: 'Acknowledgements', path: '/crew/acknowledgements' },
      { id: 'tasks', label: 'Tasks', path: '/crew/tasks' },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: Shield,
    path: '/compliance',
    moduleId: 'ism',
    tabs: [
      { id: 'dashboard', label: 'Dashboard', path: '/compliance' },
      { id: 'ism', label: 'ISM', path: '/compliance/ism' },
      { id: 'isps', label: 'ISPS', path: '/compliance/isps' },
      { id: 'mlc', label: 'MLC', path: '/compliance/mlc' },
      { id: 'marpol', label: 'MARPOL', path: '/compliance/marpol', phase: 2 },
      { id: 'audits', label: 'Audits & Inspections', path: '/compliance/audits' },
      { id: 'non-conformities', label: 'Non-Conformities & CAPA', path: '/compliance/non-conformities' },
      { id: 'risk-assessments', label: 'Risk Assessments', path: '/compliance/risk-assessments' },
      { id: 'drills', label: 'Drills', path: '/compliance/drills' },
      { id: 'incidents', label: 'Incidents & Investigations', path: '/compliance/incidents' },
      { id: 'safety-meetings', label: 'Safety Meetings', path: '/compliance/safety-meetings' },
      { id: 'permits', label: 'Permits to Work', path: '/compliance/permits' },
      { id: 'insurance', label: 'Insurance', path: '/compliance/insurance' },
      { id: 'other-ism', label: 'Other ISM', path: '/compliance/other-ism' },
    ],
  },
  {
    id: 'technical',
    label: 'Technical',
    icon: Wrench,
    path: '/technical/planned-maintenance',
    moduleId: 'maintenance',
    tabs: [
      { id: 'planned-maintenance', label: 'Planned Maintenance', path: '/technical/planned-maintenance' },
      { id: 'work-orders', label: 'Work Orders', path: '/technical/work-orders', phase: 2 },
      { id: 'defects', label: 'Defects', path: '/technical/defects' },
      { id: 'critical-equipment', label: 'Critical Equipment', path: '/technical/critical-equipment' },
      { id: 'inventory', label: 'Inventory & Spares', path: '/technical/inventory' },
      { id: 'drawings', label: 'Drawings', path: '/technical/drawings' },
      { id: 'service-reports', label: 'Service Reports', path: '/technical/service-reports', phase: 2 },
      { id: 'class-conditions', label: 'Class Conditions', path: '/technical/class-conditions', phase: 2 },
      { id: 'refit', label: 'Refit & Dry Dock', path: '/technical/refit', phase: 2 },
      { id: 'contractors', label: 'Contractors', path: '/technical/contractors', phase: 2 },
      { id: 'projects', label: 'Technical Projects', path: '/technical/projects', phase: 2 },
      { id: 'certificates', label: 'Certificates', path: '/technical/certificates' },
    ],
  },
  {
    id: 'charter-guest',
    label: 'Charter & Guest',
    icon: Anchor,
    path: '/charter/bookings',
    phase: 2,
    tabs: [
      { id: 'bookings', label: 'Bookings & Contracts', path: '/charter/bookings', phase: 2 },
      { id: 'billing', label: 'Billing', path: '/charter/billing', phase: 2 },
      { id: 'broker-comms', label: 'Broker Comms', path: '/charter/broker-comms', phase: 2 },
      { id: 'guest-preferences', label: 'Guest Preferences', path: '/charter/guest-preferences', phase: 2 },
      { id: 'provisioning', label: 'Provisioning', path: '/charter/provisioning', phase: 2 },
      { id: 'service-delivery', label: 'Service Delivery', path: '/charter/service-delivery', phase: 2 },
      { id: 'turnaround', label: 'Turnaround', path: '/charter/turnaround', phase: 2 },
      { id: 'briefing-packs', label: 'Briefing Packs', path: '/charter/briefing-packs', phase: 2 },
    ],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    icon: Package,
    path: '/procurement/requisitions',
    phase: 2,
    tabs: [
      { id: 'requisitions', label: 'Requisitions', path: '/procurement/requisitions', phase: 2 },
      { id: 'purchase-orders', label: 'Purchase Orders', path: '/procurement/purchase-orders', phase: 2 },
      { id: 'vendors', label: 'Vendors', path: '/procurement/vendors', phase: 2 },
      { id: 'budgets', label: 'Budgets', path: '/procurement/budgets', phase: 2 },
      { id: 'approvals', label: 'Approvals', path: '/procurement/approvals', phase: 2 },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: BookOpen,
    path: '/knowledge/register',
    moduleId: 'documents',
    tabs: [
      { id: 'register', label: 'Document Register', path: '/knowledge/register' },
      { id: 'manuals', label: 'Manuals', path: '/knowledge/manuals' },
      { id: 'sops', label: 'SOPs', path: '/knowledge/sops' },
      { id: 'policies', label: 'Policies', path: '/knowledge/policies' },
      { id: 'emergency-plans', label: 'Emergency Plans', path: '/knowledge/emergency-plans', phase: 2 },
      { id: 'handbooks', label: 'Handbooks', path: '/knowledge/handbooks' },
      { id: 'drawings', label: 'Drawings', path: '/knowledge/drawings' },
      { id: 'templates', label: 'Templates', path: '/knowledge/templates' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: SettingsIcon,
    // Anyone with a profile can see Vessel Settings / Branding etc; sensitive
    // tabs are gated individually via `requiredRoles`.
    path: '/administration/vessel-settings',
    moduleId: 'settings',
    tabs: [
      { id: 'company', label: 'Company', path: '/administration/company', requiredRoles: ['dpa', 'shore_management', 'master'] },
      { id: 'emergency-contacts', label: 'Emergency Contacts', path: '/administration/emergency-contacts' },
      { id: 'users', label: 'Users & Roles', path: '/administration/users', requiredRoles: ['dpa', 'shore_management'] },
      { id: 'vessel-settings', label: 'Vessel Settings', path: '/administration/vessel-settings' },
      { id: 'fleet-settings', label: 'Fleet Settings', path: '/administration/fleet-settings', requiredRoles: ['dpa', 'shore_management'] },
      { id: 'notifications', label: 'Notifications', path: '/administration/notifications', requiredRoles: ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer'] },
      { id: 'integrations', label: 'Integrations', path: '/administration/integrations', requiredRoles: ['dpa', 'shore_management'] },
      { id: 'audit-logs', label: 'Audit Logs', path: '/administration/audit-logs', phase: 2, requiredRoles: ['dpa', 'shore_management'] },
      { id: 'api-access', label: 'API Access', path: '/administration/api-access', phase: 2, requiredRoles: ['dpa', 'shore_management'] },
      { id: 'branding', label: 'Branding', path: '/administration/branding', requiredRoles: ['dpa', 'shore_management'] },
      { id: 'hr', label: 'HR', path: '/administration/hr', requiredRoles: ['dpa', 'shore_management'] },
      { id: 'feedback', label: 'Feedback', path: '/administration/feedback', requiredRoles: ['dpa', 'shore_management'] },
    ],
  },
  {
    id: 'emergency',
    label: 'Emergency',
    icon: Siren,
    path: '/emergency',
    pinned: 'bottom',
    tabs: [],
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: BarChart3,
    path: '/insights/incidents',
    moduleId: 'reports',
    phase: 2,
    tabs: [
      { id: 'incidents', label: 'Incident Analytics', path: '/insights/incidents', phase: 2 },
      { id: 'capa', label: 'CAPA Tracker', path: '/insights/capa', phase: 2 },
      { id: 'drills', label: 'Drill Analytics', path: '/insights/drills', phase: 2 },
      { id: 'trip-suggestions', label: 'Trip Suggestions', path: '/insights/trip-suggestions', phase: 2 },
    ],
  },
];

// =====================================================================
// Helpers
// =====================================================================

/**
 * Phase 2 features are hidden in production until the flag is set.
 * Toggle via `VITE_FEATURE_INSIGHTS=true` in `.env` for local development.
 */
export const isPhase2Enabled = (): boolean =>
  import.meta.env.VITE_FEATURE_INSIGHTS === 'true';

/** Domains visible in the sidebar order, footer-pinned items last. */
export const getPrimaryDomains = (): NavDomain[] =>
  NAV_DOMAINS.filter((d) => d.pinned !== 'bottom');

export const getPinnedDomains = (): NavDomain[] =>
  NAV_DOMAINS.filter((d) => d.pinned === 'bottom');

/** Find which domain a given pathname belongs to (longest-prefix match). */
export const findDomainByPath = (pathname: string): NavDomain | undefined => {
  let best: { domain: NavDomain; depth: number } | undefined;
  for (const domain of NAV_DOMAINS) {
    // Domain path prefix (e.g. "/operations/map" => "/operations").
    const segments = domain.path.split('/').filter(Boolean);
    const prefix = segments.length > 0 ? `/${segments[0]}` : '/';
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const depth = prefix.length;
      if (!best || depth > best.depth) best = { domain, depth };
    }
  }
  return best?.domain;
};

/** Tabs to display for a given domain, after phase + role filtering. */
export const getVisibleTabs = (
  domain: NavDomain,
  role: NavRole | null,
  phase2Enabled: boolean,
): NavTab[] =>
  domain.tabs.filter((tab) => {
    if (tab.phase === 2 && !phase2Enabled) return false;
    if (tab.requiredRoles && tab.requiredRoles.length > 0) {
      if (!role || !tab.requiredRoles.includes(role)) return false;
    }
    return true;
  });
