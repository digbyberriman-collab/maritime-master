import React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** Small uppercase eyebrow shown above the title (e.g. "Administration"). */
  eyebrow?: string;
  /** Page title. Rendered as <h1>. */
  title: React.ReactNode;
  /** Optional description shown beneath the title. */
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, badges, controls). */
  actions?: React.ReactNode;
  /** Optional leading icon shown to the left of the title block. */
  icon?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
  icon,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4',
      className,
    )}
  >
    <div className="flex items-start gap-3 min-w-0">
      {icon && (
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold text-foreground truncate">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
        )}
      </div>
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
    )}
  </div>
);

export default PageHeader;
