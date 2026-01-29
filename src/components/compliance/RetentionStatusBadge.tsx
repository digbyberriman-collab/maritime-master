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
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    description: 'Record is within retention period',
  },
  expiring_soon: {
    label: 'Expiring Soon',
    icon: <AlertTriangle className="w-3 h-3" />,
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    description: 'Record will expire within 90 days',
  },
  expired: {
    label: 'Expired',
    icon: <Clock className="w-3 h-3" />,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    description: 'Retention period has ended - pending archival',
  },
  archived: {
    label: 'Archived',
    icon: <Archive className="w-3 h-3" />,
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
    description: 'Record is archived and access-restricted',
  },
  pending_deletion: {
    label: 'Pending Deletion',
    icon: <Trash2 className="w-3 h-3" />,
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
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
