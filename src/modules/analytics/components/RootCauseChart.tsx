import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface RootCauseData {
  cause: string;
  count: number;
}

interface RootCauseChartProps {
  data: RootCauseData[];
}

const causeColors: Record<string, string> = {
  "Human Error": "hsl(25 95% 53%)",
  "Equipment Failure": "hsl(221 83% 53%)",
  "Procedural Gap": "hsl(271 91% 65%)",
  "Environmental": "hsl(142 71% 45%)",
  "Management System": "hsl(38 92% 50%)",
  "Other": "hsl(215 14% 45%)",
};

export const RootCauseChart: React.FC<RootCauseChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground">
        No root cause data available
      </div>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={true} vertical={false} />
          <XAxis 
            type="number"
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 12 }}
          />
          <YAxis 
            type="category" 
            dataKey="cause" 
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 11 }}
            width={110}
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
            radius={[0, 4, 4, 0]}
            name="Incidents"
          >
            {data.map((entry, index) => (
              <rect 
                key={`bar-${index}`}
                fill={causeColors[entry.cause] || "hsl(var(--primary))"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
