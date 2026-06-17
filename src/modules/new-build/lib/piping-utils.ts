// Helpers for the Piping module

export const PROGRESS_OPTIONS = [
  { value: 0, label: "0% — Not started / Not reviewed / Not sent", color: "hsl(0 0% 92%)", text: "hsl(0 0% 30%)" },
  { value: 25, label: "25% — Preparing to start", color: "hsl(45 95% 85%)", text: "hsl(30 80% 25%)" },
  { value: 50, label: "50% — In progress", color: "hsl(210 90% 80%)", text: "hsl(215 80% 25%)" },
  { value: 75, label: "75% — Awaiting info", color: "hsl(280 70% 82%)", text: "hsl(280 60% 25%)" },
  { value: 90, label: "90% — To be checked", color: "hsl(35 95% 70%)", text: "hsl(25 90% 20%)" },
  { value: 100, label: "100% — Completed / Reviewed / Sent", color: "hsl(140 60% 70%)", text: "hsl(140 70% 18%)" },
] as const;

export function progressMeta(pct: number) {
  return PROGRESS_OPTIONS.find((o) => o.value === pct) ?? PROGRESS_OPTIONS[0];
}

// Year color map — week numbers are colored by year so a "WK 09" in 2027 is
// visually distinct from a "WK 09" in 2026.
export const YEAR_COLORS: Record<number, { bg: string; fg: string; ring: string }> = {
  2025: { bg: "hsl(0 0% 95%)", fg: "hsl(0 0% 25%)", ring: "hsl(0 0% 70%)" },
  2026: { bg: "hsl(215 80% 92%)", fg: "hsl(215 80% 25%)", ring: "hsl(215 80% 60%)" },
  2027: { bg: "hsl(160 65% 88%)", fg: "hsl(160 70% 20%)", ring: "hsl(160 65% 50%)" },
  2028: { bg: "hsl(25 90% 88%)", fg: "hsl(25 90% 25%)", ring: "hsl(25 90% 55%)" },
  2029: { bg: "hsl(290 65% 90%)", fg: "hsl(290 65% 25%)", ring: "hsl(290 65% 55%)" },
  2030: { bg: "hsl(0 70% 90%)", fg: "hsl(0 70% 30%)", ring: "hsl(0 70% 55%)" },
};

export function yearColor(year?: number | null) {
  if (!year) return { bg: "transparent", fg: "hsl(0 0% 50%)", ring: "transparent" };
  return YEAR_COLORS[year] ?? { bg: "hsl(0 0% 92%)", fg: "hsl(0 0% 25%)", ring: "hsl(0 0% 60%)" };
}

export function fmtWeek(week?: number | null, year?: number | null) {
  if (week == null) return "—";
  const w = String(week).padStart(2, "0");
  return year ? `W${w} '${String(year).slice(-2)}` : `W${w}`;
}
