import React from 'react';
import { EyeOff, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RedactedFieldProps {
  label: string;
  reason?: string;
  showIcon?: boolean;
  className?: string;
}

const RedactedField: React.FC<RedactedFieldProps> = ({
  label,
  reason = 'Access restricted',
  showIcon = true,
  className = '',
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 ${className}`}>
            <div className="h-9 bg-muted rounded-md flex items-center px-3 gap-2 flex-1 border border-dashed border-border">
              {showIcon && <Lock className="w-4 h-4 text-muted-foreground" />}
              <span className="text-sm text-muted-foreground font-mono tracking-wider">
                ████████
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            <span>{label}: {reason}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default RedactedField;
