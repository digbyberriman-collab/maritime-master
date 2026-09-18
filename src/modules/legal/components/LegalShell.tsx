import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LEGAL_TABS, legalTabForPath } from '@/modules/legal/paths';

interface LegalShellProps {
  /** Page title under the module header; defaults to the active tab. */
  title?: string;
  description?: string;
  /** Right-hand slot: primary actions. */
  actions?: React.ReactNode;
  /** Optional back link for detail pages. */
  backTo?: { label: string; path: string };
  children: React.ReactNode;
}

const LEVEL_LABEL: Record<string, string> = {
  admin: 'Legal admin',
  edit: 'Legal team',
  view: 'Legal viewer',
  self: 'Requester',
  none: 'No access',
};

/**
 * Department shell for /departments/legal: module header with the user's
 * access level, the Dashboard / Requests / Documents / Forms tabs, and the
 * page content.
 */
export const LegalShell: React.FC<LegalShellProps> = ({ title, description, actions, backTo, children }) => {
  const access = useLegalAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const active = legalTabForPath(location.pathname);
  const heading = title ?? LEGAL_TABS.find((t) => t.id === active)?.label ?? 'Legal';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Scale className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Legal</span>
                {!access.loading && (
                  <Badge variant={access.canEdit ? 'default' : 'secondary'} className="text-[10px] uppercase tracking-wide">
                    {LEVEL_LABEL[access.level]}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        <Tabs value={active} onValueChange={(v) => navigate(LEGAL_TABS.find((t) => t.id === v)?.path ?? LEGAL_TABS[0].path)}>
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
            {LEGAL_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {backTo && (
          <Link to={backTo.path} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {backTo.label}
          </Link>
        )}
      </div>

      {children}
    </div>
  );
};

export default LegalShell;
