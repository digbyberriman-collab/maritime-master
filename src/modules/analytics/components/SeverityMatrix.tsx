import React from "react";
import { cn } from "@/lib/utils";

interface SeverityData {
  actual: number;
  potential: number;
  count: number;
}

interface SeverityMatrixProps {
  data: SeverityData[];
}

export const SeverityMatrix: React.FC<SeverityMatrixProps> = ({ data }) => {
  const getCountForCell = (actual: number, potential: number): number => {
    const found = data.find((d) => d.actual === actual && d.potential === potential);
    return found?.count || 0;
  };

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const getIntensity = (count: number): string => {
    if (count === 0) return "bg-muted/30";
    const ratio = count / maxCount;
    if (ratio >= 0.75) return "bg-destructive";
    if (ratio >= 0.5) return "bg-destructive/70";
    if (ratio >= 0.25) return "bg-warning";
    return "bg-warning/50";
  };

  const severityLevels = [1, 2, 3, 4, 5];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-xs text-muted-foreground p-2"></th>
                {severityLevels.map((level) => (
                  <th key={level} className="text-xs text-muted-foreground p-2 text-center">
                    {level}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {severityLevels.reverse().map((potential) => (
                <tr key={potential}>
                  <td className="text-xs text-muted-foreground p-2 text-right">
                    {potential}
                  </td>
                  {[1, 2, 3, 4, 5].map((actual) => {
                    const count = getCountForCell(actual, potential);
                    return (
                      <td key={actual} className="p-1">
                        <div
                          className={cn(
                            "w-10 h-10 rounded flex items-center justify-center text-sm font-medium transition-colors cursor-pointer hover:ring-2 hover:ring-primary",
                            getIntensity(count),
                            count > 0 ? "text-white" : "text-muted-foreground"
                          )}
                          title={`Actual: ${actual}, Potential: ${potential}, Count: ${count}`}
                        >
                          {count > 0 ? count : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>← Lower Actual Severity</span>
        <span>Higher Actual Severity →</span>
      </div>
      <p className="text-xs text-center text-muted-foreground">
        Y-axis: Potential Severity | X-axis: Actual Severity
      </p>
    </div>
  );
};
