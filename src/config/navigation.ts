import {
  LayoutDashboard,
  Map as MapIcon,
  Ship,
  Users,
  FileText,
  Shield,
  Award,
  Wrench,
  Bell,
  Settings,
  LayoutGrid,
  Building2,
  Phone,
  Plane,
  Clock,
  CalendarDays,
  CheckSquare,
  Siren,
  GraduationCap,
  MessageSquare,
  AlertCircle,
  Search,
  Clipboard,
  Eye,
  AlertTriangle,
  ClipboardList,
  BookOpen,
  FileCheck,
  Layers,
  Package,
  Anchor,
  Navigation,
  Utensils,
  Home,
  HardHat,
  FileWarning,
  Cog,
  ListChecks,
  HeartHandshake,
  type LucideIcon,
} from 'lucide-react';

// Nested child for 3rd level navigation
export interface NavGrandChild {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavChild {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  children?: NavGrandChild[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  permissions: string[];
  children?: NavChild[];
  defaultOpen?: boolean;
}

export const NAVIGATION_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    permissions: ['all'],
  },
  {
    id: 'fleet-map',
    label: 'Fleet Map',
    icon: MapIcon,
    path: '/fleet-map',
    permissions: ['DPA', 'Management', 'Captain'],
  },
  {
    id: 'vessels',
    label: 'Vessels',
    icon: Ship,
    path: '/vessels',
    permissions: ['DPA', 'Management', 'Captain'],
    defaultOpen: true,
    children: [
      { id: 'vessel-dashboard', label: 'Vessel Dashboard', path: '/vessels/dashboard', icon: LayoutGrid },
      { id: 'company-details', label: 'Company Details', path: '/vessels/company-details', icon: Building2 },
      { id: 'emergency-details', label: 'Emergency Details', path: '/vessels/emergency-details', icon: Phone },
    ],
  },
  {
    id: 'crew',
    label: 'Crew',
    icon: Users,
    path: '/crew',
    permissions: ['all'],
    children: [
      { id: 'crew-roster', label: 'Roster', path: '/crew/roster', icon: Users },
      { id: 'crew-certificates', label: 'Certificates', path: '/crew/certificates', icon: Award },
      { id: 'flights-travel', label: 'Flights & Travel', path: '/crew/flights', icon: Plane },
      { id: 'hours-of-rest', label: 'Hours of Rest', path: '/crew/hours-of-rest', icon: Clock },
      { id: 'leave', label: 'Leave', path: '/crew/leave', icon: CalendarDays },
    ],
  },
  {
    id: 'ism',
    label: 'ISM',
    icon: Shield,
    path: '/ism',
    permissions: ['all'],
    children: [
      // ERM with nested children
      {
        id: 'erm',
        label: 'ERM',
        path: '/ism/erm',
        icon: AlertCircle,
        children: [
          { id: 'emergency-checklists', label: 'Emergency Checklists', path: '/ism/erm/emergency-checklists', icon: ListChecks },
          { id: 'other-emergencies', label: 'Other Emergencies', path: '/ism/erm/other-emergencies', icon: FileWarning },
          { id: 'people-welfare', label: 'People & Welfare', path: '/ism/erm/people-welfare', icon: HeartHandshake },
        ],
      },
      // Top-level checklists
      { id: 'ism-checklists', label: 'ISM Checklists', path: '/ism/checklists', icon: CheckSquare },
      { id: 'bridge-checklists', label: 'Bridge Checklists', path: '/ism/checklists/bridge', icon: Navigation },
      { id: 'engine-room-checklists', label: 'Engine Room Checklists', path: '/ism/checklists/engine-room', icon: Cog },
      { id: 'interior-checklists', label: 'Interior Checklists', path: '/ism/checklists/interior', icon: Home },
      // Permits
      { id: 'permits-to-work', label: 'Permits to Work', path: '/ism/permits-to-work', icon: HardHat },
      // Risk Assessments with nested children
      {
        id: 'risk-assessments-nav',
        label: 'Risk Assessments',
        path: '/ism/risk-assessments',
        icon: AlertTriangle,
        children: [
          { id: 'ra-bridge', label: 'Bridge', path: '/ism/risk-assessments/bridge', icon: Navigation },
          { id: 'ra-deck', label: 'Deck', path: '/ism/risk-assessments/deck', icon: Anchor },
          { id: 'ra-engineering', label: 'Engineering', path: '/ism/risk-assessments/engineering', icon: Cog },
          { id: 'ra-interior', label: 'Interior', path: '/ism/risk-assessments/interior', icon: Home },
          { id: 'ra-galley', label: 'Galley', path: '/ism/risk-assessments/galley', icon: Utensils },
        ],
      },
      // SOPs with nested children
      {
        id: 'sops-nav',
        label: 'SOPs',
        path: '/ism/sops',
        icon: ClipboardList,
        children: [
          { id: 'sops-bridge', label: 'Bridge SOPs', path: '/ism/sops/bridge', icon: Navigation },
          { id: 'sops-deck', label: 'Deck SOPs', path: '/ism/sops/deck', icon: Anchor },
          { id: 'sops-engineering', label: 'Engineering SOPs', path: '/ism/sops/engineering', icon: Cog },
          { id: 'sops-interior', label: 'Interior SOPs', path: '/ism/sops/interior', icon: Home },
          { id: 'sops-galley', label: 'Galley SOPs', path: '/ism/sops/galley', icon: Utensils },
        ],
      },
      // Miscellaneous
      { id: 'miscellaneous-forms', label: 'Miscellaneous Forms', path: '/ism/miscellaneous', icon: FileText },
      // Existing ISM items
      { id: 'drills', label: 'Drills', path: '/ism/drills', icon: Siren },
      { id: 'training', label: 'Training', path: '/ism/training', icon: GraduationCap },
      { id: 'meetings', label: 'Meetings', path: '/ism/meetings', icon: MessageSquare },
      { id: 'incidents', label: 'Incidents', path: '/ism/incidents', icon: AlertCircle },
      { id: 'investigations', label: 'Investigations', path: '/ism/investigations', icon: Search },
      { id: 'capa', label: 'CAPA', path: '/ism/capa', icon: Clipboard },
      { id: 'non-conformities', label: 'Non-Conformities', path: '/ism/non-conformities', icon: AlertTriangle },
      { id: 'observations', label: 'Observations', path: '/ism/observations', icon: Eye },
      { id: 'audits', label: 'Audits & Surveys', path: '/ism/audits', icon: ClipboardList },
    ],
  },
  {
    id: 'certificates',
    label: 'Certificates',
    icon: Award,
    path: '/certificates',
    permissions: ['DPA', 'Management', 'Captain', 'Purser'],
    children: [
      { id: 'vessel-certificates', label: 'Vessel Certificates', path: '/certificates/vessel', icon: Ship },
      { id: 'crew-certificates-overview', label: 'Crew Certificates', path: '/certificates/crew', icon: Users },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    path: '/documents',
    permissions: ['all'],
    children: [
      { id: 'manuals', label: 'Manuals', path: '/documents/manuals', icon: BookOpen },
      { id: 'procedures-sops', label: 'Procedures & SOPs', path: '/documents/procedures', icon: ClipboardList },
      { id: 'ism-sms', label: 'ISM / SMS', path: '/documents/ism-sms', icon: Shield },
      { id: 'policies', label: 'Policies', path: '/documents/policies', icon: FileCheck },
      { id: 'drawings', label: 'Drawings', path: '/documents/drawings', icon: Layers },
    ],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    icon: Wrench,
    path: '/maintenance',
    permissions: ['DPA', 'Management', 'Captain', 'Chief_Engineer'],
    children: [
      { id: 'maintenance-dashboard', label: 'Dashboard', path: '/maintenance/dashboard', icon: LayoutGrid },
      { id: 'open-defects', label: 'Open Defects', path: '/maintenance/defects', icon: AlertTriangle },
      { id: 'critical-equipment', label: 'Critical Equipment', path: '/maintenance/critical', icon: Shield },
      { id: 'spare-parts', label: 'Spare Parts', path: '/maintenance/spares', icon: Package },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: Bell,
    path: '/alerts',
    permissions: ['DPA', 'Management', 'Captain'],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    permissions: ['all'],
  },
];

// Admin-only items (shown in Settings or separate admin section)
export const ADMIN_NAV_ITEMS: NavChild[] = [
  { id: 'user-management', label: 'User Management', path: '/admin/users', icon: Users },
  { id: 'roles-permissions', label: 'Roles & Permissions', path: '/admin/roles', icon: Shield },
  { id: 'fleet-groups', label: 'Fleet Groups', path: '/admin/fleet-groups', icon: Ship },
  { id: 'alert-configuration', label: 'Alert Configuration', path: '/admin/alerts', icon: Bell },
  { id: 'api-integrations', label: 'API Integrations', path: '/admin/integrations', icon: Wrench },
];
