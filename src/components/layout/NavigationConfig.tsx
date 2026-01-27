import {
  LayoutDashboard,
  Map as MapIcon,
  Ship,
  Users,
  FileText,
  Shield,
  ClipboardList,
  Wrench,
  Bell,
  Settings,
  Building2,
  Phone,
  LayoutGrid,
  Award,
  GraduationCap,
  Calendar,
  FileBarChart,
  BookOpen,
  FileCheck,
  AlertTriangle,
  Siren,
  Users2,
  Search,
  AlertCircle,
  Briefcase,
  Clock,
  Plane,
  CalendarDays,
  CheckSquare,
  MessageSquare,
  Clipboard,
  Package,
  Cog,
  UserCog,
  ShieldCheck,
  Layers,
  BellRing,
  Link,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  name: string;
  icon: LucideIcon;
  items: NavItem[];
  defaultOpen?: boolean;
}

export type NavigationItem = NavItem | NavGroup;

export const isNavGroup = (item: NavigationItem): item is NavGroup => {
  return 'items' in item;
};

export const navigationConfig: NavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Fleet Map', href: '/fleet-map', icon: MapIcon },
  {
    name: 'Vessels',
    icon: Ship,
    defaultOpen: true,
    items: [
      { name: 'Fleet Overview', href: '/vessels', icon: Ship },
      { name: 'Vessel Dashboard', href: '/vessels/dashboard', icon: LayoutGrid },
      { name: 'Company Details', href: '/vessels/company', icon: Building2 },
      { name: 'Emergency Details', href: '/vessels/emergency', icon: Phone },
      { name: 'Certification', href: '/certificates', icon: Award },
      { name: 'Risk Assessments', href: '/risk-assessments', icon: AlertTriangle },
    ],
  },
  {
    name: 'Crew',
    icon: Users,
    items: [
      { name: 'Roster', href: '/crew', icon: Users },
      { name: 'Certificates', href: '/crew/certificates', icon: Award },
      { name: 'Flights & Travel', href: '/crew/travel', icon: Plane },
      { name: 'Hours of Rest', href: '/crew/hours-of-rest', icon: Clock },
      { name: 'Leave', href: '/crew/leave', icon: CalendarDays },
    ],
  },
  {
    name: 'ISM',
    icon: Shield,
    items: [
      { name: 'Checklists & Forms', href: '/ism/checklists', icon: CheckSquare },
      { name: 'Drills', href: '/drills', icon: Siren },
      { name: 'Training', href: '/training', icon: GraduationCap },
      { name: 'Meetings', href: '/ism/meetings', icon: MessageSquare },
      { name: 'Incidents', href: '/incidents', icon: AlertCircle },
      { name: 'Investigations', href: '/ism/investigations', icon: Search },
      { name: 'CAPA', href: '/ism/capa', icon: Clipboard },
      { name: 'Audits', href: '/audits', icon: ClipboardList },
      { name: 'Non-Conformities', href: '/ism/non-conformities', icon: AlertTriangle },
    ],
  },
  {
    name: 'Documents',
    icon: FileText,
    items: [
      { name: 'All Documents', href: '/documents', icon: FileText },
      { name: 'Fleet Documents', href: '/documents/fleet', icon: Ship },
      { name: 'Policies', href: '/documents/policies', icon: FileCheck },
      { name: 'Manuals', href: '/documents/manuals', icon: BookOpen },
      { name: 'Procedures/SOPs', href: '/documents/sops', icon: ClipboardList },
      { name: 'Document Search', href: '/documents/search', icon: Search },
    ],
  },
  {
    name: 'Maintenance',
    icon: Wrench,
    items: [
      { name: 'Dashboard', href: '/maintenance', icon: LayoutGrid },
      { name: 'Open Defects', href: '/maintenance/defects', icon: AlertTriangle },
      { name: 'Critical Equipment', href: '/maintenance/critical', icon: Shield },
      { name: 'Spare Parts', href: '/maintenance/spares', icon: Package },
    ],
  },
  {
    name: 'Reports',
    icon: FileBarChart,
    items: [
      { name: 'Analytics', href: '/reports', icon: FileBarChart },
      { name: 'Incident Analytics', href: '/reports/incident-analytics', icon: AlertCircle },
      { name: 'CAPA Tracker', href: '/reports/capa-tracker', icon: Clipboard },
      { name: 'Drill Analytics', href: '/reports/drill-analytics', icon: Siren },
    ],
  },
  { name: 'Alerts', href: '/alerts', icon: Bell },
  {
    name: 'Settings',
    icon: Settings,
    items: [
      { name: 'General', href: '/settings', icon: Cog },
      { name: 'User Management', href: '/settings/users', icon: UserCog },
      { name: 'Roles & Permissions', href: '/settings/roles', icon: ShieldCheck },
      { name: 'Fleet Groups', href: '/settings/fleet-groups', icon: Layers },
      { name: 'Alert Configuration', href: '/settings/alerts', icon: BellRing },
      { name: 'Integrations', href: '/settings/integrations', icon: Link },
    ],
  },
];
