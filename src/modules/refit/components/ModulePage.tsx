import { ReactNode } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";

export function ModulePage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <RequireAuth>
      <AppShell>
        <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
          <PageHeader title={title} subtitle={subtitle} />
          {children ?? (
            <div className="p-8 sm:p-12 bg-card border border-black/5 rounded-sm shadow-sm text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Module shell
              </div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Backend, schema, and access rules are configured. Detailed UI for this module will
                be built in the next iteration.
              </p>
            </div>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}
