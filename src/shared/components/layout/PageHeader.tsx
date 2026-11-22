/**
 * The page heading (gap/10 IA17 "breadcrumb and page title"; Phase 1 heading
 * contract, BUILD-PLAN S6/S7). A page renders at most one of these, as the
 * first thing in its content; it is the page's only h1.
 *
 * The shell renders the breadcrumb row above every page. It adds its own h1
 * (the nav title) only when the page has none, so a page that renders
 * PageHeader (or, for now, its own h1) never shows two headings. The marker
 * attribute `data-page-heading` is how the shell recognises this component;
 * keep it.
 */
import React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: React.ReactNode;
  /** One line under the title, in muted text. */
  description?: React.ReactNode;
  /** Small uppercase label above the title (e.g. the vessel name or "Fleet"). */
  eyebrow?: React.ReactNode;
  /** Record reference shown as a mono chip after the title (`PTW-DRA-2026-061`). */
  reference?: string;
  /** Buttons on the right; they wrap under the title on narrow screens. */
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, description, eyebrow, reference, actions, className, children }) => (
  <header data-page-heading="" className={cn('mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
    <div className="min-w-0 flex-1">
      {eyebrow ? <p className="type-eyebrow mb-1 text-muted-foreground">{eyebrow}</p> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="type-display min-w-0 break-words text-foreground">{title}</h1>
        {reference ? (
          <span className="type-mono rounded-sm border border-input px-1.5 py-0.5 text-muted-foreground">{reference}</span>
        ) : null}
      </div>
      {description ? <p className="type-body mt-1 text-muted-foreground">{description}</p> : null}
      {children}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </header>
);

export default PageHeader;
