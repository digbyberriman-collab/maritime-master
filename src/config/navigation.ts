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
    id: 'alerts',
    label: 'Alerts',
    icon: Bell,
    path: '/alerts',
    permissions: ['DPA', 'Management', 'Captain'],
    children: [
      { id: 'alerts-all', label: 'All', path: '/alerts?tab=all', icon: Bell },
      { id: 'alerts-critical', label: 'Critical', path: '/alerts?tab=critical', icon: AlertCircle },
      { id: 'alerts-warning', label: 'Warnings', path: '/alerts?tab=warning', icon: AlertTriangle },
      { id: 'alerts-info', label: 'Info', path: '/alerts?tab=info', icon: MessageSquare },
    ],
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
      { id: 'fleet-timeline', label: 'Fleet Timeline', path: '/itinerary/timeline', icon: GanttChart },
      { id: 'fleet-planning', label: 'Fleet Planning', path: '/itinerary/planning', icon: LayoutGrid },
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
      { id: 'work-rest', label: 'Hours of Work & Rest', path: '/crew/work-rest', icon: Clock },
      { id: 'leave-planner', label: 'Leave Planner', path: '/crew/leave', icon: CalendarDays },
      { id: 'crew-admin', label: 'Crew Admin', path: '/crew/admin', icon: Briefcase },
      { id: 'work-rest-overview', label: 'Work/Rest Overview', path: '/crew/work-rest/overview', icon: Clock },
      { id: 'leave-requests', label: 'Leave Requests', path: '/crew/leave/requests', icon: CalendarDays },
      { id: 'leave-calculator', label: 'Leave Calculator', path: '/crew/leave/calculator', icon: CalendarDays },
    ],
  },
  {
    id: 'certificates',
    label: 'Certificates',
    icon: Award,
    path: '/certificates',
    permissions: ['DPA', 'Management', 'Captain', 'Purser'],
    children: [
      { id: 'vessel-certs', label: 'Vessel Certificates', path: '/certificates/vessel', icon: Ship },
      { id: 'crew-certs', label: 'Crew Certificates', path: '/certificates/crew', icon: Users },
      { id: 'cert-alerts', label: 'Alerts', path: '/certificates/alerts', icon: Bell },
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
      { id: 'procedures-sops', label: 'SOPs', path: '/documents/procedures', icon: ClipboardList },
      { id: 'policies', label: 'Policies', path: '/documents/policies', icon: FileCheck },
      { id: 'ism-sms', label: 'ISM / SMS', path: '/documents/ism-sms', icon: Shield },
      { id: 'drawings', label: 'Drawings', path: '/documents/drawings', icon: Layers },
    ],
  },
  {
    id: 'flights-travel',
    label: 'Flights & Travel',
    icon: Plane,
    path: '/flights-travel',
    permissions: ['all'],
    children: [
      { id: 'ft-upcoming', label: 'Upcoming Trips', path: '/flights-travel?tab=upcoming', icon: Plane },
      { id: 'ft-search', label: 'Search Flights', path: '/flights-travel?tab=search', icon: Search },
      { id: 'ft-history', label: 'Booking History', path: '/flights-travel?tab=history', icon: Clock },
      { id: 'ft-budget', label: 'Budget', path: '/flights-travel?tab=budget', icon: FileCheck },
    ],
  },
  {
    id: 'ism',
    label: 'Compliance',
    icon: Shield,
    path: '/ism',
    permissions: ['all'],
    children: [
      { id: 'ism-code', label: 'ISM Code', path: '/compliance?tab=ism', icon: Shield },
      { id: 'isps', label: 'ISPS', path: '/compliance?tab=isps', icon: Anchor },
      { id: 'mlc', label: 'MLC', path: '/compliance?tab=mlc', icon: Users },
      { id: 'marpol', label: 'MARPOL', path: '/compliance?tab=marpol', icon: Layers },
      { id: 'incidents', label: 'Incidents', path: '/ism/incidents', icon: AlertTriangle },
      { id: 'drills', label: 'Drills', path: '/ism/drills', icon: Siren },
      { id: 'audits-surveys', label: 'Audits & Surveys', path: '/ism/audits-surveys', icon: ClipboardList },
      { id: 'corrective-actions', label: 'Corrective Actions (CAPA)', path: '/ism/corrective-actions', icon: Clipboard },
      { id: 'ism-checklists', label: 'Checklists', path: '/ism/checklists', icon: CheckSquare },
      { id: 'risk-assessments', label: 'Risk Assessments', path: '/ism/risk-assessments', icon: Shield },
      { id: 'permits-to-work', label: 'Permits to Work', path: '/ism/permits-to-work', icon: HardHat },
      { id: 'non-conformities', label: 'Non-Conformities', path: '/ism/non-conformities', icon: XCircle },
      { id: 'observations', label: 'Observations', path: '/ism/observations', icon: Eye },
      { id: 'training', label: 'Training', path: '/ism/training', icon: GraduationCap },
      { id: 'investigations', label: 'Investigations', path: '/ism/investigations', icon: Search },
      { id: 'meetings', label: 'Safety Meetings', path: '/ism/meetings', icon: MessageSquare },
      { id: 'erm', label: 'Emergency Response Manual (ERM)', path: '/ism/erm', icon: AlertCircle },
      { id: 'sops', label: 'Standard Operating Procedures (SOPs)', path: '/ism/sops', icon: BookOpen },
      { id: 'miscellaneous', label: 'Miscellaneous ISM Forms', path: '/ism/miscellaneous', icon: FileText },
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
    children: [
      { id: 'hr-contracts', label: 'Contracts & Employment', path: '/hr?tab=contracts-employment', icon: FileText },
      { id: 'hr-salaries', label: 'Salaries & Compensation', path: '/hr?tab=salaries-compensation', icon: FileCheck },
      { id: 'hr-evaluations', label: 'Annual Evaluations', path: '/hr?tab=annual-evaluations', icon: ClipboardList },
      { id: 'hr-reviews', label: 'Annual Reviews', path: '/hr?tab=annual-reviews', icon: ClipboardList },
      { id: 'hr-pay-reviews', label: 'Pay Reviews', path: '/hr?tab=pay-reviews', icon: FileCheck },
      { id: 'hr-end-rotation', label: 'End of Rotation', path: '/hr?tab=end-of-rotation', icon: Clock },
      { id: 'hr-disciplinary', label: 'Disciplinary Matters', path: '/hr?tab=disciplinary-matters', icon: AlertTriangle },
    ],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    icon: Umbrella,
    path: '/insurance',
    permissions: ['DPA', 'Management', 'Captain'],
    children: [
      { id: 'ins-claims', label: 'Claims & Incidents', path: '/insurance?tab=claims-incidents', icon: AlertTriangle },
      { id: 'ins-pi', label: 'P&I', path: '/insurance?tab=pi', icon: Shield },
      { id: 'ins-hull', label: 'Hull & Machinery', path: '/insurance?tab=hull-machinery', icon: Ship },
      { id: 'ins-crew-liab', label: 'Crew Employers Liability', path: '/insurance?tab=crew-employers-liability', icon: Users },
      { id: 'ins-bunker', label: 'Bunker Liability', path: '/insurance?tab=bunker-liability', icon: FileCheck },
      { id: 'ins-pollution', label: 'Pollution Liability', path: '/insurance?tab=pollution-liability', icon: AlertCircle },
      { id: 'ins-war', label: 'War & Piracy', path: '/insurance?tab=war-piracy', icon: Shield },
      { id: 'ins-wreck', label: 'Wreck Removal', path: '/insurance?tab=wreck-removal', icon: XCircle },
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
