// Settings page permission utilities for STORM platform

import { LucideIcon, User, Shield, Bell, Palette, Ship, Lock, Eye, Plug, Mail, Download, FileCheck, CreditCard, ScrollText, HelpCircle } from 'lucide-react';

export interface SettingsNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  scope: 'self' | 'admin';
  permission?: string;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: 'profile', label: 'My Profile', icon: User, scope: 'self' },
  { id: 'security', label: 'Security', icon: Shield, scope: 'self' },
  { id: 'notifications', label: 'Notifications', icon: Bell, scope: 'self' },
  { id: 'appearance', label: 'Appearance', icon: Palette, scope: 'self' },
  { id: 'vessel-access', label: 'Vessel Access', icon: Ship, scope: 'admin', permission: 'vessel_settings' },
  { id: 'permissions', label: 'Permissions', icon: Lock, scope: 'admin', permission: 'rbac' },
  { id: 'audit-mode', label: 'Audit Visibility', icon: Eye, scope: 'admin', permission: 'audit_mode' },
  { id: 'integrations', label: 'Integrations', icon: Plug, scope: 'admin', permission: 'integrations' },
  { id: 'templates', label: 'Email Templates', icon: Mail, scope: 'admin', permission: 'templates' },
  { id: 'data-exports', label: 'Data & Exports', icon: Download, scope: 'self' },
  { id: 'compliance', label: 'Compliance', icon: FileCheck, scope: 'admin', permission: 'compliance' },
  { id: 'billing', label: 'Billing', icon: CreditCard, scope: 'admin', permission: 'billing' },
  { id: 'logs', label: 'System Logs', icon: ScrollText, scope: 'admin', permission: 'logs' },
  { id: 'support', label: 'Support', icon: HelpCircle, scope: 'self' },
];

// Role-based permission mapping
const ROLE_PERMISSIONS: Record<string, string[]> = {
  dpa: ['vessel_settings', 'rbac', 'audit_mode', 'integrations', 'templates', 'compliance', 'billing', 'logs'],
  shore_management: ['vessel_settings', 'rbac', 'audit_mode', 'integrations', 'templates', 'compliance', 'billing', 'logs'],
  master: ['vessel_settings', 'audit_mode'],
  captain: ['vessel_settings', 'audit_mode'],
  chief_officer: ['vessel_settings'],
  chief_engineer: ['vessel_settings'],
  crew: [],
};

/**
 * Check if a user role has a specific settings permission
 */
export const hasSettingsPermission = (userRole: string | null, permission: string): boolean => {
  if (!userRole) return false;
  const roleKey = userRole.toLowerCase();
  return ROLE_PERMISSIONS[roleKey]?.includes(permission) || false;
};

/**
 * Get visible navigation items based on user role
 */
export const getVisibleNavItems = (userRole: string | null): SettingsNavItem[] => {
  return SETTINGS_NAV_ITEMS.filter(item => {
    if (item.scope === 'self') return true;
    if (item.permission) return hasSettingsPermission(userRole, item.permission);
    return false;
  });
};

/**
 * Check if user can access a specific settings section
 */
export const canAccessSection = (userRole: string | null, sectionId: string): boolean => {
  const item = SETTINGS_NAV_ITEMS.find(i => i.id === sectionId);
  if (!item) return false;
  if (item.scope === 'self') return true;
  if (item.permission) return hasSettingsPermission(userRole, item.permission);
  return false;
};
