import React from 'react';
import { cn } from '@/lib/utils';

interface SettingsCardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  contentClassName?: string;
  headerAction?: React.ReactNode;
  noPadding?: boolean;
}

const SettingsCard: React.FC<SettingsCardProps> = ({
  children,
  title,
  description,
  className,
  contentClassName,
  headerAction,
  noPadding = false,
}) => {
  return (
    <div className={cn(
      'bg-card rounded-lg border shadow-sm',
      className
    )}>
      {(title || description) && (
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      <div className={cn(
        !noPadding && 'p-6',
        title && !noPadding && 'pt-0',
        contentClassName
      )}>
        {children}
      </div>
    </div>
  );
};

export default SettingsCard;
