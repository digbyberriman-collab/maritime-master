import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { seriesColor } from './chartColors';

/** Small, theme-aware Recharts wrappers shared by the HR dashboard and the Reporting page. */

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
}

interface BaseProps {
  data: Record<string, string | number>[];
  xKey: string;
  series: ChartSeries[];
  height?: number;
  emptyMessage?: string;
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

const EmptyState: React.FC<{ height: number; message: string }> = ({ height, message }) => (
  <div style={{ height }} className="flex items-center justify-center text-sm text-muted-foreground">
    {message}
  </div>
);

const hasValues = (data: Record<string, string | number>[], series: ChartSeries[]): boolean =>
  data.some((row) => series.some((s) => Number(row[s.key]) > 0));

export const SimpleBarChart: React.FC<BaseProps & { stacked?: boolean; layout?: 'horizontal' | 'vertical' }> = ({
  data,
  xKey,
  series,
  height = 240,
  stacked,
  layout = 'horizontal',
  emptyMessage = 'No data for the selected filters',
}) => {
  if (!data.length || !hasValues(data, series)) return <EmptyState height={height} message={emptyMessage} />;
  const vertical = layout === 'vertical';
  return (
    <div style={{ height }} className="text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 8, right: 12, left: vertical ? 8 : -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={xKey} width={110} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? seriesColor(i)} stackId={stacked ? 'stack' : undefined} radius={stacked ? 0 : 3} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const SimpleLineChart: React.FC<BaseProps & { unit?: string }> = ({ data, xKey, series, height = 240, unit, emptyMessage = 'No data for the selected filters' }) => {
  if (!data.length || !hasValues(data, series)) return <EmptyState height={height} message={emptyMessage} />;
  return (
    <div style={{ height }} className="text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} unit={unit} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => (unit ? `${value}${unit}` : value)} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? seriesColor(i)} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
