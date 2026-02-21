import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface ToggleProps {
  id: string;
  label: string;
  description?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  icon?: LucideIcon;
  className?: string;
  size?: 'default' | 'compact';
}

const Toggle: React.FC<ToggleProps> = ({
  id,
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  icon: Icon,
  className,
  size = 'default',
}) => {
  return (
    <div className={cn(
      'flex items-center justify-between gap-4',
      size === 'compact' ? 'py-2' : 'py-3',
      className
    )}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0">
          <Label 
            htmlFor={id} 
            className={cn(
              'font-medium cursor-pointer',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {label}
          </Label>
          {description && (
            <p className={cn(
              'text-sm text-muted-foreground truncate',
              disabled && 'opacity-50'
            )}>
              {description}
            </p>
          )}
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="shrink-0"
      />
    </div>
  );
};

export default Toggle;
