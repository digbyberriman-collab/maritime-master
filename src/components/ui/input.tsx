import * as React from "react";

import { cn } from "@/lib/utils";

/** Height follows the density token `--control-h` (gap/10 A.7), like Button and SelectTrigger. */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[var(--control-h)] w-full rounded-md border border-input bg-field px-3 py-1.5 text-base text-foreground ring-offset-background transition-colors duration-quick ease-tide file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
