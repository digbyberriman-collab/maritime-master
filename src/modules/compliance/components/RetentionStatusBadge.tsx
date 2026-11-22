import React from 'react';
import { Clock, Archive, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type RetentionStatus = 'active' | 'expiring_soon' | 'expired' | 'archived' | 'pending_deletion';

interface RetentionStatusBadgeProps {
  status: RetentionStatus;
  expiryDate?: Date;
  retentionPeriod?: string;
  showTooltip?: boolean;
}

const statusConfig: Record<RetentionStatus, { label: string; icon: React.ReactNode; className: string; description: string }> = {
  active: {
    label: 'Active',
    icon: <CheckCircle className="w-3 h-3" />,
    className: 'bg-success-muted text-success',
    description: 'Record is within retention period',
  },
  expiring_soon: {
    label: 'Expiring Soon',
    icon: <AlertTriangle className="w-3 h-3" />,
    className: 'bg-warning-muted text-warning',
    description: 'Record will expire within 90 days',
  },
  expired: {
    label: 'Expired',
    icon: <Clock className="w-3 h-3" />,
    className: 'bg-critical-muted text-critical',
    description: 'Retention period has ended - pending archival',
  },
  archived: {
    label: 'Archived',
    icon: <Archive className="w-3 h-3" />,
    className: 'bg-muted text-foreground',
    description: 'Record is archived and access-restricted',
  },
  pending_deletion: {
    label: 'Pending Deletion',
    icon: <Trash2 className="w-3 h-3" />,
    className: 'bg-purple-muted text-purple',
    description: 'Awaiting DPA approval for deletion',
  },
};

const RetentionStatusBadge: React.FC<RetentionStatusBadgeProps> = ({
  status,
  expiryDate,
  retentionPeriod,
  showTooltip = true,
}) => {
  const config = statusConfig[status];

  const badge = (
    <Badge variant="outline" className={`${config.className} text-xs flex items-center gap-1`}>
      {config.icon}
      {config.label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p className="font-medium">{config.description}</p>
            {retentionPeriod && <p>Retention: {retentionPeriod}</p>}
            {expiryDate && <p>Expires: {expiryDate.toLocaleDateString()}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default RetentionStatusBadge;
