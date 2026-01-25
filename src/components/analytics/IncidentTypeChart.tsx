import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { INCIDENT_TYPES } from "@/lib/incidentConstants";

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
    // Map Tailwind classes to HSL values
    const colorMap: Record<string, string> = {
      "bg-blue-500": "hsl(221 83% 53%)",
      "bg-orange-500": "hsl(25 95% 53%)",
      "bg-red-500": "hsl(0 72% 51%)",
      "bg-yellow-500": "hsl(38 92% 50%)",
      "bg-purple-500": "hsl(271 91% 65%)",
      "bg-gray-500": "hsl(215 14% 45%)",
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
