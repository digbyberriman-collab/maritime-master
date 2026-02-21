import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface AgingData {
  bucket: string;
  count: number;
}

interface CAPAAgingChartProps {
  data: AgingData[];
}

const bucketColors: Record<string, string> = {
  "0-7 days": "hsl(142 71% 45%)",
  "8-30 days": "hsl(221 83% 53%)",
  "31-60 days": "hsl(38 92% 50%)",
  "61-90 days": "hsl(25 95% 53%)",
  "90+ days": "hsl(0 72% 51%)",
};

export const CAPAAgingChart: React.FC<CAPAAgingChartProps> = ({ data }) => {
  if (data.every((d) => d.count === 0)) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground">
        No open CAPAs
      </div>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="bucket" 
            className="text-xs fill-muted-foreground"
            tick={{ fontSize: 10 }}
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
          <Bar dataKey="count" radius={[4, 4, 0, 0]} name="CAPAs">
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={bucketColors[entry.bucket] || "hsl(var(--primary))"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
