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
  Anchor,
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
    label: 'Crew Management',
    icon: Users,
    path: '/crew',
    permissions: ['all'],
    children: [
      { id: 'crew-list', label: 'Crew List', path: '/crew/roster', icon: Users },
      { id: 'crew-admin', label: 'Crew Admin', path: '/crew/admin', icon: Briefcase },
      { id: 'hours-of-rest', label: 'Hours of Rest', path: '/crew/hours-of-rest', icon: Clock },
      { id: 'leave-planner', label: 'Leave Planner', path: '/crew/leave', icon: CalendarDays },
      { id: 'leave-requests', label: 'Leave Requests', path: '/crew/leave/requests', icon: CalendarDays },
    ],
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: Shield,
    path: '/compliance',
    permissions: ['all'],
    children: [
      { id: 'ism-code', label: 'ISM Code', path: '/compliance?tab=ism', icon: Shield },
      { id: 'isps', label: 'ISPS', path: '/compliance?tab=isps', icon: Anchor },
      { id: 'mlc', label: 'MLC', path: '/compliance?tab=mlc', icon: Users },
    ],
  },
  {
    id: 'certificates',
    label: 'Certificates',
    icon: Award,
    path: '/certificates',
    permissions: ['DPA', 'Management', 'Captain', 'Purser'],
    // FLAT — no "Vessel Certificates" subfolder. Filter tabs are on the page itself.
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
    id: 'checklists',
    label: 'Checklists',
    icon: CheckSquare,
    path: '/checklists',
    permissions: ['all'],
  },
  {
    id: 'flights-travel',
    label: 'Flights & Travel',
    icon: Plane,
    path: '/flights-travel',
    permissions: ['all'],
  },
  {
    id: 'ism',
    label: 'ISM',
    icon: Shield,
    path: '/ism',
    permissions: ['all'],
    children: [
      { id: 'audits-surveys', label: 'Audits & Surveys', path: '/ism/audits-surveys', icon: ClipboardList },
      { id: 'ism-checklists', label: 'Checklists', path: '/ism/checklists', icon: CheckSquare },
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
    id: 'development',
    label: 'Crew Development',
    icon: GraduationCap,
    path: '/development',
    permissions: ['all'],
    children: [
      { id: 'my-development', label: 'My Development', path: '/development/my', icon: Users },
      { id: 'course-catalogue', label: 'Course Catalogue', path: '/development/catalogue', icon: BookOpen },
      { id: 'dev-applications', label: 'Applications', path: '/development/applications', icon: ClipboardList },
      { id: 'dev-admin', label: 'Admin', path: '/development/admin', icon: LayoutGrid },
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
  { id: 'feedback-admin', label: 'Feedback', path: '/admin/feedback', icon: MessageSquare },
];
