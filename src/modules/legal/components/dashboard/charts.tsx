import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthBucket, StatusSlice } from '@/modules/legal/lib/dashboard';

const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };

const ChartTooltip: React.FC<TooltipProps<number, string> & { suffix?: string }> = ({ active, payload, label, suffix = '' }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{String(item.name ?? label ?? '')}</p>
      <p className="tabular-nums text-muted-foreground">
        {item.value}
        {suffix}
      </p>
    </div>
  );
};

/** Status breakdown as a donut with a legend that carries the counts. */
export const StatusDonut: React.FC<{ slices: StatusSlice[]; total: number }> = ({ slices, total }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">Requests by status</CardTitle>
      <CardDescription>{total === 0 ? 'No requests yet' : `${total} request${total === 1 ? '' : 's'} in total`}</CardDescription>
    </CardHeader>
    <CardContent>
      {total === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Nothing to chart yet.</div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="h-48 w-48 shrink-0" role="img" aria-label={slices.map((s) => `${s.label} ${s.count}`).join(', ')}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="count" nameKey="label" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
                  {slices.map((s) => (
                    <Cell key={s.status} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="w-full space-y-1.5 text-sm">
            {slices.map((s) => (
              <li key={s.status} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-foreground">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {s.count} · {Math.round((s.count / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardContent>
  </Card>
);

/** Six-month request volume, one series. */
export const VolumeBars: React.FC<{ buckets: MonthBucket[] }> = ({ buckets }) => {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Request volume</CardTitle>
        <CardDescription>{total === 0 ? 'No requests in the last six months' : `${total} raised in the last six months`}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full" role="img" aria-label={buckets.map((b) => `${b.label} ${b.count}`).join(', ')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip suffix=" requests" />} />
              <Bar dataKey="count" name="Requests" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
