import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TrendInsight {
  type: "warning" | "positive" | "alert" | "insight";
  icon: string;
  message: string;
}

interface TrendInsightsPanelProps {
  insights: TrendInsight[];
}

export const TrendInsightsPanel: React.FC<TrendInsightsPanelProps> = ({ insights }) => {
  const getInsightStyle = (type: TrendInsight["type"]) => {
    switch (type) {
      case "warning":
        return "border-l-warning bg-warning/5";
      case "positive":
        return "border-l-success bg-success/5";
      case "alert":
        return "border-l-destructive bg-destructive/5";
      case "insight":
        return "border-l-primary bg-primary/5";
      default:
        return "border-l-muted";
    }
  };

  return (
    <Card className="shadow-card">
      <CardContent className="pt-6">
        <h3 className="text-lg font-semibold mb-4">Trend Insights</h3>
        <div className="space-y-3">
          {insights.map((insight, index) => (
            <div
              key={index}
              className={cn(
                "p-3 rounded-r-lg border-l-4",
                getInsightStyle(insight.type)
              )}
            >
              <span className="mr-2">{insight.icon}</span>
              <span className="text-sm">{insight.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
