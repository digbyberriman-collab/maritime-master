import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import InkfishWatermark from '@/shared/components/InkfishWatermark';
import { StormWordmark } from './StormWordmark';

/** Bearing ring ticks every 10 degrees (long every 30), on a 400-unit square centred on 200,200. */
const TICKS = Array.from({ length: 36 }, (_, i) => {
  const angle = (i * 10 * Math.PI) / 180;
  const outer = 196;
  const inner = i % 3 === 0 ? 184 : 190;
  const point = (r: number) => [200 + r * Math.sin(angle), 200 - r * Math.cos(angle)].map((n) => Number(n.toFixed(2)));
  const [x1, y1] = point(inner);
  const [x2, y2] = point(outer);
  return { key: i, x1, y1, x2, y2 };
});

/**
 * The sign-in hero (gap/10 A.2: gradients are for the sign-in hero only): a
 * Signal glow from `--gradient-primary` and faint bearing rings, behind the
 * content. Decorative, theme-aware through tokens, and clipped so it never
 * causes horizontal scroll.
 */
function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-[5] overflow-hidden" data-auth-backdrop="">
      <div className="absolute left-1/2 top-[-20rem] h-[36rem] w-[64rem] -translate-x-1/2 rounded-[50%] bg-gradient-primary opacity-[var(--auth-glow-opacity)] blur-[120px]" />
      <svg
        viewBox="0 0 400 400"
        className="absolute left-1/2 top-[-17rem] size-[46rem] -translate-x-1/2 text-primary opacity-[var(--auth-rings-opacity)]"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="200" cy="200" r="196" strokeWidth="0.75" />
        <circle cx="200" cy="200" r="150" strokeWidth="0.5" />
        <circle cx="200" cy="200" r="104" strokeWidth="0.5" strokeDasharray="2 4" />
        <line x1="200" y1="4" x2="200" y2="396" strokeWidth="0.4" />
        <line x1="4" y1="200" x2="396" y2="200" strokeWidth="0.4" />
        {TICKS.map((t) => (
          <line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.key % 3 === 0 ? 1 : 0.6} />
        ))}
      </svg>
    </div>
  );
}

/**
 * Frame for the signed-out screens (sign-in, reset password): Abyss page
 * (Daylight via tokens), hero backdrop, STORM wordmark, one column of content.
 *
 * Stacking: the root is `relative isolate`, so the watermark (in its own
 * `-z-10` layer, D-DS5 keeps it on every page) and the backdrop sit above the
 * page background and below the card. Mobile: content starts at the top and the page scrolls, so
 * the on-screen keyboard never hides the form; 16 px inputs avoid zoom.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-background text-foreground" data-auth-screen="">
      {/* Own stacking layer below the backdrop and the card, whatever z-index the watermark carries. */}
      <div className="pointer-events-none fixed inset-0 -z-10" data-auth-watermark-layer="">
        <InkfishWatermark />
      </div>
      <AuthBackdrop />
      <main
        id="main-content"
        className="flex w-full flex-1 flex-col items-center px-4 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] sm:justify-center sm:py-16"
      >
        <div className="w-full max-w-[25rem]">
          <div className="mb-8 flex justify-center">
            <StormWordmark size="lg" />
          </div>
          {children}
        </div>
      </main>
      <footer className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 text-center type-caption text-muted-foreground">
        Superyacht Technical Operations, Research &amp; Management
      </footer>
    </div>
  );
}

interface AuthCardProps {
  /** The page's only h1. */
  title: string;
  description?: React.ReactNode;
  /** A state icon above the title (reset link invalid, password changed …). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * The sign-in card: `--gradient-card` over the card surface (sign-in hero
 * only) with a Signal hairline on top. Padding steps down at 390 px so the
 * fields keep their width.
 */
export function AuthCard({ title, description, icon, children, className }: AuthCardProps) {
  return (
    <Card className={cn('relative overflow-hidden bg-gradient-card shadow-e2 motion-safe:animate-fade-in', className)}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="space-y-1.5 px-5 pb-1 pt-6 sm:px-6">
        {icon}
        <h1 className="type-display text-foreground">{title}</h1>
        {description ? <div className="type-body text-muted-foreground">{description}</div> : null}
      </div>
      {children ? <div className="px-5 pb-6 pt-5 sm:px-6">{children}</div> : null}
    </Card>
  );
}

export default AuthLayout;
