import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

const labelFor: Record<CrewMemberWithStatus['certStatus'], string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  missing: 'None',
};

export const CertStatusCell: React.FC<{ member: CrewMemberWithStatus }> = ({ member }) => {
  const { certStatus, earliestCertExpiry, expiringCount } = member;
  const total = member.crew_certificates?.length ?? 0;

  const colour =
    certStatus === 'expired'
      ? 'border-destructive/40 text-destructive bg-destructive/10'
      : certStatus === 'expiring'
      ? 'border-warning/40 text-warning-foreground bg-warning/10'
      : certStatus === 'valid'
      ? 'border-success/40 text-success bg-success/10'
      : 'border-muted text-muted-foreground bg-muted/40';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={colour}>
            {labelFor[certStatus]}
            {expiringCount > 0 ? ` · ${expiringCount}` : ''}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div>{total} certificate{total === 1 ? '' : 's'} on file</div>
            {earliestCertExpiry && (
              <div>Earliest expiry: {format(earliestCertExpiry, 'yyyy-MM-dd')}</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
