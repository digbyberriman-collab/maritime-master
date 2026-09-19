import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrendPoint {
  day: string;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

const axisTick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

interface CalorieTrendProps {
  data: TrendPoint[];
  targetCalories?: number | null;
  height?: number;
}

/** Calories a day over the window, against the person's target. */
export const CalorieTrendChart: React.FC<CalorieTrendProps> = ({
  data,
  targetCalories,
  height = 220,
}) => (
  <div style={{ height }} className="text-xs">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="calorie-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={tooltipStyle} />
        {targetCalories ? (
          <ReferenceLine
            y={targetCalories}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            label={{ value: 'Target', position: 'insideTopRight', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey="calories"
          name="Calories"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#calorie-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

/** Protein, carbohydrate and fat a day, stacked. */
export const MacroTrendChart: React.FC<{ data: TrendPoint[]; height?: number }> = ({
  data,
  height = 220,
}) => (
  <div style={{ height }} className="text-xs">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="protein" name="Protein (g)" stackId="macros" fill="hsl(var(--primary))" maxBarSize={28} />
        <Bar dataKey="carbs" name="Carbs (g)" stackId="macros" fill="hsl(var(--warning))" maxBarSize={28} />
        <Bar dataKey="fat" name="Fat (g)" stackId="macros" fill="hsl(var(--success))" maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export interface MeasurementPoint {
  label: string;
  value: number | null;
}

/** A single metric over time, used on the goals page. */
export const MeasurementTrendChart: React.FC<{
  data: MeasurementPoint[];
  name: string;
  targetValue?: number | null;
  height?: number;
}> = ({ data, name, targetValue, height = 200 }) => (
  <div style={{ height }} className="text-xs">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="metric-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} />
        <Tooltip contentStyle={tooltipStyle} />
        {targetValue !== null && targetValue !== undefined ? (
          <ReferenceLine y={targetValue} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
        ) : null}
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          connectNulls
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#metric-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);
