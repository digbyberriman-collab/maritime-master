/**
 * Chart palette shared by the HR dashboard and Reporting page. shadcn tokens
 * where one exists; fixed hues (legible in dark mode) for extra series.
 */
export const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(160 60% 45%)',
  'hsl(38 92% 50%)',
  'hsl(280 65% 60%)',
  'hsl(199 89% 48%)',
  'hsl(var(--destructive))',
  'hsl(var(--muted-foreground))',
] as const;

export const seriesColor = (index: number): string => CHART_COLORS[index % CHART_COLORS.length];
