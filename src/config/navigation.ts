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
  HardHat,
  XCircle,
  Umbrella,
  Briefcase,
  Compass,
  GanttChart,
  Lightbulb,
  PauseCircle,
  type LucideIcon,
} from 'lucide-react';

// Child for 2nd level navigation
export interface NavChild {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
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
      { id: 'crew-admin', label: 'Crew Admin', path: '/crew/admin', icon: Briefcase },
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
      // Alphabetical order - 15 items, flat (no nested children)
      { id: 'audits-surveys', label: 'Audits & Surveys', path: '/ism/audits-surveys', icon: ClipboardList },
      { id: 'checklists', label: 'Checklists', path: '/ism/checklists', icon: CheckSquare },
      { id: 'corrective-actions', label: 'Corrective Actions (CAPA)', path: '/ism/corrective-actions', icon: Clipboard },
      { id: 'drills', label: 'Drills', path: '/ism/drills', icon: Siren },
      { id: 'erm', label: 'Emergency Response Manual (ERM)', path: '/ism/erm', icon: AlertCircle },
      { id: 'incidents', label: 'Incidents', path: '/ism/incidents', icon: AlertTriangle },
      { id: 'investigations', label: 'Investigations', path: '/ism/investigations', icon: Search },
      { id: 'meetings', label: 'Meetings', path: '/ism/meetings', icon: MessageSquare },
      { id: 'miscellaneous', label: 'Miscellaneous ISM Forms', path: '/ism/miscellaneous', icon: FileText },
      { id: 'non-conformities', label: 'Non-Conformities', path: '/ism/non-conformities', icon: XCircle },
      { id: 'observations', label: 'Observations', path: '/ism/observations', icon: Eye },
      { id: 'permits-to-work', label: 'Permits to Work', path: '/ism/permits-to-work', icon: HardHat },
      { id: 'risk-assessments', label: 'Risk Assessments', path: '/ism/risk-assessments', icon: Shield },
      { id: 'sops', label: 'Standard Operating Procedures (SOPs)', path: '/ism/sops', icon: BookOpen },
      { id: 'training', label: 'Training', path: '/ism/training', icon: GraduationCap },
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
    id: 'itinerary',
    label: 'Itinerary',
    icon: Compass,
    path: '/itinerary',
    permissions: ['all'],
    children: [
      { id: 'fleet-planning', label: 'Fleet Planning', path: '/itinerary/planning', icon: LayoutGrid },
      { id: 'fleet-timeline', label: 'Fleet Timeline', path: '/itinerary/timeline', icon: GanttChart },
      { id: 'trip-suggestions', label: 'Trip Suggestions', path: '/itinerary/suggestions', icon: Lightbulb },
      { id: 'postponed', label: 'Postponed', path: '/itinerary/postponed', icon: PauseCircle },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    icon: Briefcase,
    path: '/hr',
    permissions: ['DPA', 'Management'],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    icon: Umbrella,
    path: '/insurance',
    permissions: ['DPA', 'Management', 'Captain'],
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
