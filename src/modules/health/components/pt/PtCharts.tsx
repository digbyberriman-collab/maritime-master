import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/** Series colours come from the theme so both light and dark read correctly. */
export const PT_SERIES_COLOURS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--muted-foreground))',
];

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

const axisTick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

export interface PtChartSeries {
  key: string;
  label: string;
  colour?: string;
}

interface PtChartProps {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: PtChartSeries[];
  height?: number;
  emptyMessage?: string;
}

const Empty: React.FC<{ height: number; message: string }> = ({ height, message }) => (
  <div
    style={{ height }}
    className="flex items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground"
  >
    {message}
  </div>
);

const hasValues = (data: PtChartProps['data'], series: PtChartSeries[]): boolean =>
  data.some((row) => series.some((s) => row[s.key] !== null && row[s.key] !== undefined));

/** A line per metric over time: weight, body fat, girths. */
export const PtTrendChart: React.FC<PtChartProps> = ({
  data,
  xKey,
  series,
  height = 240,
  emptyMessage = 'Nothing recorded yet',
}) => {
  if (!data.length || !hasValues(data, series)) return <Empty height={height} message={emptyMessage} />;
  return (
    <div style={{ height }} className="text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
          <Tooltip contentStyle={tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.colour ?? PT_SERIES_COLOURS[i % PT_SERIES_COLOURS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Bars per week: training volume, sessions completed. */
export const PtBarChart: React.FC<PtChartProps & { stacked?: boolean }> = ({
  data,
  xKey,
  series,
  height = 240,
  stacked,
  emptyMessage = 'Nothing logged yet',
}) => {
  if (!data.length || !hasValues(data, series)) return <Empty height={height} message={emptyMessage} />;
  return (
    <div style={{ height }} className="text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.colour ?? PT_SERIES_COLOURS[i % PT_SERIES_COLOURS.length]}
              stackId={stacked ? 'stack' : undefined}
              radius={stacked ? 0 : 3}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
