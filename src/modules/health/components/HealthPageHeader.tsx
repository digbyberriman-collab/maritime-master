import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';

interface HealthPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Which resolver the badge reports. Clinical pages pass `medical`. */
  scope?: 'medical' | 'wellness';
  /** Right-hand slot: primary actions. */
  actions?: React.ReactNode;
  /** Slot under the title row: filters, person picker, tabs. */
  toolbar?: React.ReactNode;
}

const MEDICAL_LABEL: Record<string, string> = {
  admin: 'Clinical admin',
  edit: 'Clinical',
  view: 'Clinical read-only',
  self: 'My records',
  none: 'No clinical access',
};

const WELLNESS_LABEL: Record<string, string> = {
  admin: 'Wellness admin',
  edit: 'Wellness',
  view: 'Wellness read-only',
  self: 'My records',
  none: 'No wellness access',
};

/**
 * Standard health page header. The badge states the access the signed-in
 * person actually holds, so a medic and a deckhand can tell at a glance why
 * they are seeing different things on the same page.
 */
export const HealthPageHeader: React.FC<HealthPageHeaderProps> = ({
  icon: Icon,
  title,
  description,
  scope = 'wellness',
  actions,
  toolbar,
}) => {
  const medical = useMedicalAccess();
  const wellness = useWellnessAccess();
  const access = scope === 'medical' ? medical : wellness;
  const labels = scope === 'medical' ? MEDICAL_LABEL : WELLNESS_LABEL;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
              {!access.loading && (
                <Badge
                  variant={access.canEdit ? 'default' : 'secondary'}
                  className="text-[10px] uppercase tracking-wide"
                >
                  {labels[access.level]}
                </Badge>
              )}
            </div>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {toolbar && <div className="flex flex-col gap-3 md:flex-row md:items-center">{toolbar}</div>}
    </div>
  );
};

export default HealthPageHeader;
