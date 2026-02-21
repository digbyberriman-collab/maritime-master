import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { INCIDENT_TYPES } from "@/modules/incidents/constants";

interface TypeData {
  type: string;
  count: number;
}

interface IncidentTypeChartProps {
  data: TypeData[];
}

const getColorForType = (type: string): string => {
  const found = INCIDENT_TYPES.find((t) => t.value === type);
  if (found) {
    // Map semantic tokens to HSL values
    const colorMap: Record<string, string> = {
      "bg-info": "hsl(var(--info))",
      "bg-orange": "hsl(var(--orange))",
      "bg-critical": "hsl(var(--critical))",
      "bg-warning": "hsl(var(--warning))",
      "bg-purple": "hsl(var(--purple))",
      "bg-muted-foreground": "hsl(var(--muted-foreground))",
    };
    return colorMap[found.color] || "hsl(var(--primary))";
  }
  return "hsl(var(--muted))";
};

export const IncidentTypeChart: React.FC<IncidentTypeChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No data available
      </div>
    );
  }

  const total = data.reduce((acc, item) => acc + item.count, 0);
  const chartData = data.map((item) => ({
    name: item.type,
    value: item.count,
    percentage: Math.round((item.count / total) * 100),
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percentage }) => `${name}: ${percentage}%`}
            labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getColorForType(entry.name)}
              />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number, name: string) => [value, name]}
            contentStyle={{ 
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
