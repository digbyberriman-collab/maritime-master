import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The frame of a crew dashboard card (X1-10B): a titled card that a KPI tile
 * can point at (`#anchor`, focusable so the jump lands on it), an optional
 * header link and footer links. The body is the card's own.
 */
export interface DashboardCardProps {
  anchor: string;
  title: string;
  subtitle?: React.ReactNode;
  icon: LucideIcon;
  /** A count or short fact on the right of the title. */
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  'data-dashboard-card'?: string;
}

export const DashboardCard: React.FC<DashboardCardProps> = ({ anchor, title, subtitle, icon: Icon, aside, footer, className, children, ...rest }) => (
  <Card id={anchor} tabIndex={-1} role="region" aria-labelledby={`${anchor}-title`} className={cn('min-w-0 scroll-mt-24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} data-dashboard-card={rest['data-dashboard-card']}>
    <CardHeader className="flex-row items-start gap-2 space-y-0">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <h2 id={`${anchor}-title`} className="type-subtitle font-semibold leading-tight text-foreground">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 type-caption text-muted-foreground">{subtitle}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </CardHeader>
    <CardContent className="space-y-3">
      {children}
      {footer ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3">{footer}</div> : null}
    </CardContent>
  </Card>
);

const linkClass =
  'inline-flex min-h-8 items-center gap-1 rounded-sm type-body-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11';

/** A footer or header link of a card. */
export const CardLink: React.FC<{ to: string; children: React.ReactNode; 'data-card-link'?: string }> = ({ to, children, ...rest }) => (
  <Link to={to} className={linkClass} data-card-link={rest['data-card-link']}>
    {children}
    <ArrowRight aria-hidden="true" className="size-3.5" />
  </Link>
);

/** A person's name: a link to their profile when the viewer may open it, else plain text. */
export const PersonName: React.FC<{ name: string; href: string | null }> = ({ name, href }) =>
  href ? (
    <Link
      to={href}
      className="rounded-sm type-body font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center"
    >
      {name}
    </Link>
  ) : (
    <span className="type-body font-medium text-foreground">{name}</span>
  );

/** Skeleton rows while a card's list loads. */
export const CardRowsLoading: React.FC<{ rows?: number; label: string }> = ({ rows = 3, label }) => (
  <div className="space-y-3" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-5 w-16" />
      </div>
    ))}
  </div>
);

/** A one-line card message (empty, not set up, switched off). */
export const CardNote: React.FC<{ children: React.ReactNode; 'data-card-note'?: string }> = ({ children, ...rest }) => (
  <p className="type-body text-muted-foreground" data-card-note={rest['data-card-note']}>
    {children}
  </p>
);
