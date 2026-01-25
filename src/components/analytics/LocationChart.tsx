import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface LocationData {
  location: string;
  count: number;
}

interface LocationChartProps {
  data: LocationData[];
}

export const LocationChart: React.FC<LocationChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No location data available
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={true} vertical={false} />
          <XAxis 
            type="number" 
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 12 }}
          />
          <YAxis 
            type="category" 
            dataKey="location" 
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 11 }}
            width={75}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Bar 
            dataKey="count" 
            fill="hsl(var(--primary))" 
            radius={[0, 4, 4, 0]}
            name="Incidents"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
