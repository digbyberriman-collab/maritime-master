import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/*
 * Underlined tabs (gap/10 DS19, A.4): a hairline under the list and a Signal
 * indicator under the active trigger (with the Signal glow on dark). The
 * indicator grows in with the `indicator` motion token and is static under
 * reduced motion. Vertical lists put the indicator on the left edge.
 * Consumers can still restyle with className (e.g. `grid w-full grid-cols-4`).
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-start gap-1 border-b border-border text-muted-foreground data-[orientation=vertical]:h-auto data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:border-b-0 data-[orientation=vertical]:border-l md:h-9",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Trigger
      "relative inline-flex h-full items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors duration-quick ease-tide hover:text-foreground data-[state=active]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:py-1",
      // Signal indicator (horizontal: bottom edge over the list hairline)
      "after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-indicator after:ease-tide data-[state=active]:after:scale-x-100 data-[state=active]:after:shadow-glow-signal",
      // Vertical: left edge
      "data-[orientation=vertical]:justify-start data-[orientation=vertical]:after:inset-x-auto data-[orientation=vertical]:after:inset-y-1 data-[orientation=vertical]:after:-left-px data-[orientation=vertical]:after:bottom-auto data-[orientation=vertical]:after:h-auto data-[orientation=vertical]:after:w-0.5 data-[orientation=vertical]:after:scale-x-100 data-[orientation=vertical]:after:scale-y-0 data-[orientation=vertical]:data-[state=active]:after:scale-y-100",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
