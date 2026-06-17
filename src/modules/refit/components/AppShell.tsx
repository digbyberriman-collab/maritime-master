import { ReactNode } from "react";

/**
 * Shim of Ship Shape Command's AppShell.
 * STORM's DashboardLayout (via RefitShell) provides chrome,
 * so this just passes children through.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 pb-4 border-b border-border">
      <div className="min-w-0">
        {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : null}
        {description ? (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {(actions || children) && (
        <div className="flex items-center gap-2 shrink-0">{actions ?? children}</div>
      )}
    </div>
  );
}

export default AppShell;