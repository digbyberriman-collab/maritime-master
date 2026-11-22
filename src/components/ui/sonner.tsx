import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Sonner on the Abyss tokens (gap/10 DS19, DECISIONS D-05). The theme comes
 * from next-themes (resolved, so `system` follows the same rule as the page).
 * Toasts sit on the popover surface at e2; success / error / warning / info
 * use their status tint with the title and icon in the tone, never a raw
 * palette colour.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();
  const theme: ToasterProps["theme"] = resolvedTheme === "light" ? "light" : "dark";

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-lg group-[.toaster]:border-border group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-lg",
          title: "group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:border-border group-[.toast]:bg-popover group-[.toast]:text-muted-foreground group-[.toast]:hover:text-foreground",
          success:
            "group-[.toaster]:border-success/40 group-[.toaster]:bg-success-muted [&_[data-icon]]:text-success [&_[data-title]]:text-success",
          error:
            "group-[.toaster]:border-critical/40 group-[.toaster]:bg-critical-muted [&_[data-icon]]:text-critical [&_[data-title]]:text-critical",
          warning:
            "group-[.toaster]:border-warning/40 group-[.toaster]:bg-warning-muted [&_[data-icon]]:text-warning [&_[data-title]]:text-warning",
          info: "group-[.toaster]:border-info/40 group-[.toaster]:bg-info-muted [&_[data-icon]]:text-info [&_[data-title]]:text-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
