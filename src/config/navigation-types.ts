import type { LucideIcon } from 'lucide-react';

export interface NavChild {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  children?: NavChild[];
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