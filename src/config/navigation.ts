import {
  Users, Shield, Ship, Wrench, Bell, MessageSquare,
} from 'lucide-react';
import type { NavChild, NavItem } from './navigation-types';

export type { NavChild, NavItem };

// Full sitemap-derived sidebar tree lives in ./sitemap.
export { NAVIGATION_ITEMS, PLACEHOLDER_LEAVES } from './sitemap';
export type { SitemapLeaf } from './sitemap';

// Admin-only items (shown in Settings or separate admin section)
export const ADMIN_NAV_ITEMS: NavChild[] = [
  { id: 'user-management', label: 'User Management', path: '/admin/users', icon: Users },
  { id: 'roles-permissions', label: 'Roles & Permissions', path: '/admin/roles', icon: Shield },
  { id: 'fleet-groups', label: 'Fleet Groups', path: '/admin/fleet-groups', icon: Ship },
  { id: 'alert-configuration', label: 'Alert Configuration', path: '/admin/alerts', icon: Bell },
  { id: 'api-integrations', label: 'API Integrations', path: '/admin/integrations', icon: Wrench },
  { id: 'feedback-admin', label: 'Feedback', path: '/admin/feedback', icon: MessageSquare },
];

// Legacy export removed; old block below kept only to satisfy module shape.
const _unused_legacy: NavItem[] = [
  {
    id: 'alerts',
    label: 'Alerts',
    icon: Bell,
    path: '/alerts',
    permissions: ['DPA', 'Management', 'Captain'],
  },
];
void _unused_legacy;
