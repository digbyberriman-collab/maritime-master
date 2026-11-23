import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

type CommandDialogContentProps = Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "children"> & {
  /** `data-testid` and other data attributes pass straight to the panel. */
  [dataAttribute: `data-${string}`]: string | undefined;
};

interface CommandDialogProps extends DialogProps {
  /**
   * The dialog's accessible name, rendered as a visually hidden
   * `DialogTitle` (every dialog needs one, WCAG 4.1.2).
   */
  title?: string;
  /** A visually hidden `DialogDescription`; omitted when not given. */
  description?: string;
  /** Props for the dialog panel: `data-testid`, `className`, `onCloseAutoFocus`, … */
  contentProps?: CommandDialogContentProps;
  /** Props for the inner `Command`: `label`, `filter`, `loop`, `vimBindings`, … */
  commandProps?: Omit<React.ComponentPropsWithoutRef<typeof CommandPrimitive>, "children">;
  /**
   * The corner close button. On by default; a caller that renders its own
   * close control (the command palette's input row) turns it off.
   */
  showCloseButton?: boolean;
}

/*
 * A command menu in a modal dialog (e3 surface on the scrim). Anchored near
 * the top rather than centred, so the list grows downwards without the input
 * jumping; below 640px it is a full-width sheet from the top edge, which
 * leaves room for the on-screen keyboard.
 */
const CommandDialog = ({
  children,
  title = "Command menu",
  description,
  contentProps,
  commandProps,
  showCloseButton = true,
  ...props
}: CommandDialogProps) => {
  const { className: contentClassName, ...panelProps } = contentProps ?? {};
  const { className: commandClassName, ...innerProps } = commandProps ?? {};
  return (
    <Dialog {...props}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          {...panelProps}
          className={cn(
            "fixed inset-x-0 top-0 z-50 flex max-h-dvh flex-col overflow-hidden border border-t-0 border-border bg-popover text-popover-foreground shadow-xl outline-none",
            "rounded-b-lg pt-[env(safe-area-inset-top)]",
            "sm:top-[12dvh] sm:mx-auto sm:max-h-[76dvh] sm:w-[calc(100vw-2rem)] sm:max-w-[40rem] sm:rounded-lg sm:border-t sm:pt-0",
            "duration-menu ease-tide data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 motion-reduce:animate-none",
            contentClassName,
          )}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {description ? <DialogDescription className="sr-only">{description}</DialogDescription> : null}
          <Command
            {...innerProps}
            className={cn(
              "min-h-0 flex-1 rounded-none bg-transparent [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-[18px] [&_[cmdk-input-wrapper]_svg]:w-[18px] [&_[cmdk-input]]:h-12",
              commandClassName,
            )}
          >
            {children}
          </Command>
          {showCloseButton ? (
            <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground ring-offset-popover transition-colors duration-quick ease-tide hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

type CommandInputProps = React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
  /** Classes for the row around the input (border, padding, height). */
  wrapperClassName?: string;
  /** Rendered after the input inside the row (a close control, a shortcut hint). */
  trailing?: React.ReactNode;
};

/** The first selected option of this command root (not of a command nested in it). */
function selectedOption(root: Element): HTMLElement | null {
  for (const item of Array.from(root.querySelectorAll<HTMLElement>('[cmdk-item][aria-selected="true"]'))) {
    if (item.closest("[cmdk-root]") === root) return item;
  }
  return null;
}

/*
 * Keeps the input's `aria-activedescendant` on the option Enter will run
 * (WAI-ARIA combobox; gap/10 IA4, IA12). cmdk writes the attribute itself,
 * after the caller's props, and it lags the selection: missing until the
 * first arrow key, stale after a query changes the first match. A
 * MutationObserver on the command root (so lists that mount later are covered)
 * follows `aria-selected` and corrects the input, writing only when the value
 * differs, so its own writes end the loop and cmdk's stale ones are undone.
 */
function useActiveDescendantSync(inputRef: React.RefObject<HTMLInputElement>): void {
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    const root = input?.closest("[cmdk-root]");
    if (!input || !root || typeof MutationObserver === "undefined") return undefined;
    const sync = () => {
      const id = selectedOption(root)?.id || null;
      if (id) {
        if (input.getAttribute("aria-activedescendant") !== id) input.setAttribute("aria-activedescendant", id);
      } else if (input.hasAttribute("aria-activedescendant")) {
        input.removeAttribute("aria-activedescendant");
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected", "id", "aria-activedescendant"],
    });
    return () => observer.disconnect();
  }, [inputRef]);
}

const CommandInput = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Input>, CommandInputProps>(
  ({ className, wrapperClassName, trailing, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );
    useActiveDescendantSync(inputRef);
    return (
      <div className={cn("flex items-center gap-2 border-b border-border px-3", wrapperClassName)} cmdk-input-wrapper="">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <CommandPrimitive.Input
          ref={setRefs}
          className={cn(
            "flex h-11 w-full min-w-0 rounded-md bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {trailing}
      </div>
    );
  },
);

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden overscroll-contain", className)}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn("type-body py-6 text-center text-muted-foreground", className)}
    {...props}
  />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

/* Group headings use the eyebrow ramp (D-20), like the sidebar's section headings. */
const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:type-eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-muted-foreground",
      className,
    )}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator ref={ref} className={cn("-mx-1 h-px bg-border", className)} {...props} />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

/*
 * Selected option (gap/10 A.5, WCAG 1.4.11, D-34): a signal-muted fill plus a
 * 2px primary bar on the leading edge; the bar (>= 3:1 on the popover) is the
 * cue. 44px rows on coarse pointers (D-35).
 */
const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-signal-muted data-[selected=true]:text-foreground data-[selected=true]:shadow-[inset_2px_0_0_hsl(var(--primary))] data-[disabled=true]:opacity-50 [@media(pointer:coarse)]:min-h-11",
      className,
    )}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return <span className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />;
};
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
