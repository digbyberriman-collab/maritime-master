import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Card (gap/10 A.4 e1). Always opaque: besides its own `bg-card`, it paints an
 * opaque `bg-card` underlay in a `::before` layer at `z-index: -1`. A caller's
 * translucent tint (`<Card className="bg-primary/5">`, `bg-warning/10`, …)
 * then sits on card colour instead of on whatever is behind the card, so the
 * shell watermark and the page never show through a tinted card. No
 * `isolate` here on purpose: the underlay must stay in the card's parent
 * stacking context, between the watermark (`-z-10`) and the card's own
 * background. `relative` is the underlay's containing block; a caller's
 * `absolute` / `fixed` / `sticky` still wins through tailwind-merge.
 */
export const CARD_UNDERLAY_CLASSES =
  "relative before:pointer-events-none before:absolute before:inset-0 before:-z-[1] before:rounded-[inherit] before:bg-card before:content-['']";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", CARD_UNDERLAY_CLASSES, className)}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1 p-4", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold leading-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-4 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
