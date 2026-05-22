import React from 'react';
import { Ship, Plane, ShieldAlert, Stethoscope, UserMinus, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import type { CrewQuickFilter } from '@/modules/crew/hooks/useCrewListPreferences';

const MEDICAL_ROLES = ['superadmin', 'dpa', 'captain', 'medical_officer'];

const CHIPS: Array<{
  id: CrewQuickFilter;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  medicalGated?: boolean;
}> = [
  { id: 'onboard', label: 'Onboard', Icon: Ship },
  { id: 'on_leave', label: 'On Leave', Icon: Plane },
  { id: 'cert_expiring', label: 'Cert Expiring', Icon: ShieldAlert },
  { id: 'medical_expiring', label: 'Medical Expiring', Icon: Stethoscope, medicalGated: true },
  { id: 'no_assignment', label: 'No Assignment', Icon: UserMinus },
  { id: 'contract_ending', label: 'Contract Ending', Icon: CalendarClock },
];

interface CrewQuickFilterChipsProps {
  active: CrewQuickFilter[];
  onToggle: (f: CrewQuickFilter) => void;
}

export const CrewQuickFilterChips: React.FC<CrewQuickFilterChipsProps> = ({ active, onToggle }) => {
  const hasRole = usePermissionsStore((s) => s.hasRole);
  const isMedical = MEDICAL_ROLES.some((r) => hasRole(r));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {CHIPS.filter((c) => !c.medicalGated || isMedical).map(({ id, label, Icon }) => {
        const isActive = active.includes(id);
        return (
          <Badge
            key={id}
            variant={isActive ? 'default' : 'outline'}
            onClick={() => onToggle(id)}
            className={`gap-1.5 cursor-pointer select-none transition-colors ${
              isActive ? '' : 'hover:bg-muted'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Badge>
        );
      })}
    </div>
  );
};
