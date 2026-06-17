import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = supabaseClient;

export type Vessel = {
  id: string;
  name: string;
  hull_number: string | null;
};

type Ctx = {
  vessels: Vessel[];
  activeVesselId: string | null;
  activeVessel: Vessel | null;
  setActiveVesselId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ActiveVesselContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "oceancos.activeVesselId";

export function ActiveVesselProvider({ children }: { children: ReactNode }) {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [activeVesselId, setActiveVesselIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rf_vessels" as any)
      .select("id, name, hull_number")
      .order("name", { ascending: true });
    const list = (data ?? []) as unknown as Vessel[];
    setVessels(list);
    // Resolve active id: stored value if still valid, else first vessel
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const valid = stored && list.some((v) => v.id === stored) ? stored : (list[0]?.id ?? null);
    setActiveVesselIdState(valid);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setActiveVesselId = useCallback((id: string) => {
    setActiveVesselIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activeVessel = vessels.find((v) => v.id === activeVesselId) ?? null;

  return (
    <ActiveVesselContext.Provider
      value={{ vessels, activeVesselId, activeVessel, setActiveVesselId, loading, refresh }}
    >
      {children}
    </ActiveVesselContext.Provider>
  );
}

export function useActiveVessel() {
  const ctx = useContext(ActiveVesselContext);
  if (!ctx) throw new Error("useActiveVessel must be used within ActiveVesselProvider");
  return ctx;
}
