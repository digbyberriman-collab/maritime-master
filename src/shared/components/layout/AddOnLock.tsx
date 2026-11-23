/**
 * The explanation behind a locked add-on (gap/10 "Nav visibility rule": an
 * add-on that fails only its entitlement stays visible with a lock; spec
 * §4.1 step 6, §5.4; DECISIONS G4). Opening a locked sidebar leaf or vessel
 * tab shows this popover; it never navigates to the add-on's pages.
 *
 * The popover keeps its own open state unless the caller controls it with
 * `open` / `onOpenChange` (the collapsed sidebar does, to keep its icon
 * tooltip closed while the explanation is open).
 */
import React from 'react';
import { Lock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface AddOnLockProps {
  /** The add-on as the nav names it ("Deck Plans"). */
  label: string;
  /** The trigger: a button that shows the locked node. */
  children: React.ReactElement;
  side?: 'right' | 'bottom';
  /** Controlled open state; leave both out for an uncontrolled popover. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const AddOnLock: React.FC<AddOnLockProps> = ({ label, children, side = 'right', open, onOpenChange }) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>{children}</PopoverTrigger>
    <PopoverContent side={side} align="start" className="w-[min(18rem,calc(100vw-2rem))] p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="type-subtitle text-popover-foreground">{label} is an add-on</p>
          <p className="type-body-sm text-muted-foreground">An account admin can enable it in Add-ons.</p>
        </div>
      </div>
    </PopoverContent>
  </Popover>
);

export default AddOnLock;
