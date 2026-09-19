import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';

interface HrisPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Right-hand slot: primary actions. */
  actions?: React.ReactNode;
  /** Slot under the title row: filters, crew picker, tabs. */
  toolbar?: React.ReactNode;
}

const LEVEL_LABEL: Record<string, string> = {
  admin: 'HR admin',
  edit: 'HR editor',
  view: 'HR viewer',
  self: 'My records',
  none: 'No HR access',
};

/** Standard HRIS page header with the user's HR access level shown. */
export const HrisPageHeader: React.FC<HrisPageHeaderProps> = ({ icon: Icon, title, description, actions, toolbar }) => {
  const access = useHrAccess();
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-1.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">{title}</h1>
              {!access.loading && (
                <Badge variant={access.canEdit ? 'default' : 'secondary'} className="text-[10px] uppercase tracking-wide">
                  {LEVEL_LABEL[access.level]}
                </Badge>
              )}
            </div>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {toolbar && <div className="flex flex-col gap-2 md:flex-row md:items-center">{toolbar}</div>}
    </div>
  );
};

export default HrisPageHeader;
