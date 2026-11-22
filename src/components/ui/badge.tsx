import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { TONE_SURFACE } from "./tones";

/*
 * Badges (gap/10 DS12, DS19). The original variants keep their names: solid
 * fills carry their `-foreground` token (Abyss ink on Signal on dark). Tone
 * variants (`ok` … `neutral`) are the tinted status surfaces from §A.8; for a
 * status with a label and icon prefer `<StatusPill>`. `role` is the outline,
 * mono style for designated-role badges (IHM, SSO, Medical …) so they never
 * read as a status.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        ok: TONE_SURFACE.ok,
        signal: TONE_SURFACE.signal,
        info: TONE_SURFACE.info,
        purple: TONE_SURFACE.purple,
        warn: TONE_SURFACE.warn,
        orange: TONE_SURFACE.orange,
        danger: TONE_SURFACE.danger,
        neutral: TONE_SURFACE.neutral,
        role: "rounded-sm border-input bg-transparent font-mono text-[11px] font-medium text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
