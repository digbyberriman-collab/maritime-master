/**
 * The vessel home's "Quick actions" menu (gap/10 W4, S4; DECISIONS D-04,
 * D-86, D-104; BUILD-PLAN Phase 1 deferred item "vessel home off-module
 * actions"). Every action belongs to one vessel:
 *
 * - It is offered only when the caller holds its capability on this vessel
 *   (the `useCan` adaptor, fail closed while access loads) and its module is
 *   on for the vessel (`vessel_module_settings`). While the settings load,
 *   or after they failed, every module-switched action is hidden (D-86):
 *   "Log incident" never shows with Safety off.
 * - Links stay inside the vessel scope (`/v/<code>/…`); "Log incident" opens
 *   the incident form with this vessel (`reportIncidentPath`, D-104) and
 *   "Audits and surveys" keeps its old URL until its stream rebuilds it
 *   (D-27).
 * - With no action left the menu is not rendered at all.
 *
 * Items are 44 px on touch; the menu is keyboard operable (Radix).
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Award, ChevronDown, ClipboardCheck, FileText, Plus, Target, Users, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { resolveCapability } from '@/lib/permissions/adaptor';
import { useAccessSnapshot } from '@/lib/permissions/useCan';
import type { CapabilityKey } from '@/lib/permissions/types';
import { REPORT_INCIDENT_CAPABILITY, REPORT_INCIDENT_MODULE, reportIncidentPath } from '@/shared/components/command-palette/sources';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';

interface QuickActionDef {
  id: string;
  group: 'create' | 'open';
  label: string;
  description?: string;
  icon: LucideIcon;
  capability: CapabilityKey;
  /** The `vessel_module_settings` key that must be on (dotted keys inherit their parents). */
  moduleKey: string;
  href: (vessel: { id: string; code: string }) => string;
}

const ACTIONS: readonly QuickActionDef[] = [
  {
    id: 'log-incident',
    group: 'create',
    label: 'Log incident',
    description: 'Report an incident or near miss',
    icon: AlertTriangle,
    capability: REPORT_INCIDENT_CAPABILITY,
    moduleKey: REPORT_INCIDENT_MODULE,
    href: (v) => reportIncidentPath(v.id),
  },
  {
    id: 'sms-form',
    group: 'create',
    label: 'Fill in an SMS form',
    description: 'Start a safety management form',
    icon: FileText,
    capability: 'vessel.safety.sms_forms.create',
    moduleKey: 'safety',
    href: (v) => vesselPath(v.code, 'safety/forms'),
  },
  {
    id: 'drills',
    group: 'create',
    label: 'Plan a drill',
    description: 'Open the drill schedule',
    icon: Target,
    capability: 'vessel.safety.drills.create',
    moduleKey: 'safety',
    href: (v) => vesselPath(v.code, 'safety/drills'),
  },
  {
    id: 'crew-list',
    group: 'open',
    label: 'Crew list',
    icon: Users,
    capability: 'vessel.crew.crew_list.view',
    moduleKey: 'crew',
    href: (v) => vesselPath(v.code, 'crew/list'),
  },
  {
    id: 'certificates',
    group: 'open',
    label: 'Certificates',
    icon: Award,
    capability: 'vessel.certificates.status_summary.view',
    moduleKey: 'certificates',
    href: (v) => vesselPath(v.code, 'certificates'),
  },
  {
    id: 'jobs',
    group: 'open',
    label: 'Technical jobs',
    icon: Wrench,
    capability: 'vessel.technical.tasks.view',
    moduleKey: 'technical.jobs',
    href: (v) => vesselPath(v.code, 'technical'),
  },
  {
    id: 'audits',
    group: 'open',
    label: 'Audits and surveys',
    icon: ClipboardCheck,
    capability: 'vessel.safety.audits_surveys.view',
    moduleKey: 'safety',
    href: () => '/ism/audits-surveys',
  },
];

const GROUP_LABEL: Readonly<Record<QuickActionDef['group'], string>> = {
  create: 'Create',
  open: 'Go to',
};

export interface QuickActionsMenuProps {
  vesselId: string;
  /** The vessel's code (D-03), for links inside the vessel scope. */
  vesselCode: string;
  /**
   * Whether a module is on for this vessel (`resolveModuleSettings(...).isModuleOn`):
   * false for every key while the settings load or after they failed.
   */
  isModuleOn: (moduleKey: string) => boolean;
}

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({ vesselId, vesselCode, isModuleOn }) => {
  const snapshot = useAccessSnapshot();
  const offered = useMemo(
    () =>
      ACTIONS.filter(
        (action) => isModuleOn(action.moduleKey) && resolveCapability(action.capability, snapshot, { vesselId }).allowed,
      ),
    [snapshot, vesselId, isModuleOn],
  );

  if (offered.length === 0) return null;
  const groups = (['create', 'open'] as const)
    .map((group) => ({ group, actions: offered.filter((a) => a.group === group) }))
    .filter((g) => g.actions.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" className="[@media(pointer:coarse)]:min-h-11">
          <Plus aria-hidden="true" className="h-4 w-4" />
          Quick actions
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {groups.map(({ group, actions }, index) => (
          <React.Fragment key={group}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="type-caption text-muted-foreground">{GROUP_LABEL[group]}</DropdownMenuLabel>
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <DropdownMenuItem key={action.id} asChild className="cursor-pointer gap-2.5 [@media(pointer:coarse)]:min-h-11">
                    <Link to={action.href({ id: vesselId, code: vesselCode })} data-action={action.id}>
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span className="flex min-w-0 flex-col">
                        <span>{action.label}</span>
                        {action.description ? <span className="text-xs text-muted-foreground">{action.description}</span> : null}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default QuickActionsMenu;
