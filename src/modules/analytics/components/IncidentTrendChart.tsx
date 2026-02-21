import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface TrendData {
  month: string;
  total: number;
  injuries: number;
  nearMisses: number;
  pollution: number;
}

interface IncidentTrendChartProps {
  data: TrendData[];
}

export const IncidentTrendChart: React.FC<IncidentTrendChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No data available for the selected period
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="month" 
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 12 }}
          />
          <YAxis 
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 12 }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="total" 
            stroke="hsl(var(--primary))" 
            strokeWidth={2}
            name="Total"
          />
          <Line 
            type="monotone" 
            dataKey="injuries" 
            stroke="hsl(var(--destructive))" 
            strokeWidth={2}
            name="Injuries"
          />
          <Line 
            type="monotone" 
            dataKey="nearMisses" 
            stroke="hsl(221 83% 53%)" 
            strokeWidth={2}
            name="Near Misses"
          />
          <Line 
            type="monotone" 
            dataKey="pollution" 
            stroke="hsl(0 72% 51%)" 
            strokeWidth={2}
            name="Pollution"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
