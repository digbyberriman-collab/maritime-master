import { ReactNode } from "react";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { ActiveVesselProvider } from "@/modules/refit/lib/activeVessel";
import { SessionProvider } from "@/modules/refit/lib/session";

/**
 * Wraps every Refit page so they share the active-vessel and session
 * providers ported from Ship Shape Command, inside STORM's DashboardLayout.
 */
export default function RefitShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ActiveVesselProvider>
        <DashboardLayout>
          <div className="space-y-4">{children}</div>
        </DashboardLayout>
      </ActiveVesselProvider>
    </SessionProvider>
  );
}
