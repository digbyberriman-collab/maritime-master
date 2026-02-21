import React, { useState } from "react";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Target,
  Clock,
  HeartPulse,
  Download,
  BarChart3
} from "lucide-react";
import { useVessels } from "@/modules/vessels/hooks/useVessels";
import { 
  useIncidentAnalytics, 
  useIncidentInsights,
  useVesselComparison,
  getDateRangeFromPreset,
  DateRangePreset 
} from "@/modules/analytics/hooks/useIncidentAnalytics";
import { IncidentTrendChart } from "@/modules/analytics/components/IncidentTrendChart";
import { IncidentTypeChart } from "@/modules/analytics/components/IncidentTypeChart";
import { SeverityMatrix } from "@/modules/analytics/components/SeverityMatrix";
import { LocationChart } from "@/modules/analytics/components/LocationChart";
import { RootCauseChart } from "@/modules/analytics/components/RootCauseChart";
import { VesselComparisonTable } from "@/modules/analytics/components/VesselComparisonTable";
import { TrendInsightsPanel } from "@/modules/analytics/components/TrendInsightsPanel";
import { cn } from "@/lib/utils";

const IncidentAnalytics: React.FC = () => {
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last30");
  const [selectedVessel, setSelectedVessel] = useState<string>("all");
  const { vessels } = useVessels();
  const dateRange = getDateRangeFromPreset(datePreset);
  
  const { data: analytics, isLoading } = useIncidentAnalytics(
    dateRange,
    selectedVessel === "all" ? undefined : selectedVessel
  );
  
  const insights = useIncidentInsights(analytics);
  const { data: vesselComparison } = useVesselComparison(dateRange);

  const getTrendIndicator = (current: number, previous: number) => {
    if (previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    const isUp = change > 0;
    return {
      change: Math.abs(Math.round(change)),
      isUp,
      icon: isUp ? TrendingUp : TrendingDown,
      color: isUp ? "text-destructive" : "text-success",
    };
  };

  const incidentTrend = analytics 
    ? getTrendIndicator(analytics.totalIncidents, analytics.previousPeriodTotal)
    : null;
  
  const closureTrend = analytics
    ? getTrendIndicator(analytics.avgDaysToClose, analytics.previousAvgDaysToClose)
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Incident Analytics</h1>
            <p className="text-muted-foreground">
              Trends, insights and performance metrics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DateRangePreset)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last30">Last 30 Days</SelectItem>
                <SelectItem value="lastQuarter">Last Quarter</SelectItem>
                <SelectItem value="lastYear">Last Year</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedVessel} onValueChange={setSelectedVessel}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Select vessel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vessels</SelectItem>
                {vessels?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Incidents
              </CardTitle>
              <BarChart3 className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : analytics?.totalIncidents || 0}
                </span>
                {incidentTrend && (
                  <Badge 
                    variant="outline" 
                    className={cn("gap-1", incidentTrend.color)}
                  >
                    <incidentTrend.icon className="w-3 h-3" />
                    {incidentTrend.change}%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                vs previous period
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Lost Time Injuries
              </CardTitle>
              <HeartPulse className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : analytics?.lostTimeInjuries || 0}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Severity 4+ injuries
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Near Miss Ratio
              </CardTitle>
              <Target className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : analytics?.nearMissRatio || "0:0"}
                </span>
                {analytics && analytics.injuries > 0 && analytics.nearMisses / analytics.injuries >= 10 && (
                  <Badge variant="outline" className="text-success border-success">
                    On Target
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Target: 10:1 near miss to injury
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Days to Close
              </CardTitle>
              <Clock className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : analytics?.avgDaysToClose || 0}
                </span>
                {closureTrend && (
                  <Badge 
                    variant="outline" 
                    className={cn("gap-1", closureTrend.isUp ? "text-destructive" : "text-success")}
                  >
                    <closureTrend.icon className="w-3 h-3" />
                    {closureTrend.change}%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                vs previous period
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Trend Insights */}
        {insights.length > 0 && <TrendInsightsPanel insights={insights} />}

        {/* Charts */}
        <Tabs defaultValue="trends" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="comparison">Vessel Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Incident Trend</CardTitle>
                  <CardDescription>Monthly incident counts by type</CardDescription>
                </CardHeader>
                <CardContent>
                  <IncidentTrendChart data={analytics?.byMonth || []} />
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Incident Types</CardTitle>
                  <CardDescription>Distribution by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <IncidentTypeChart data={analytics?.byType || []} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Severity Matrix</CardTitle>
                  <CardDescription>Actual vs Potential severity</CardDescription>
                </CardHeader>
                <CardContent>
                  <SeverityMatrix data={analytics?.bySeverity || []} />
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Location Analysis</CardTitle>
                  <CardDescription>Incidents by ship location</CardDescription>
                </CardHeader>
                <CardContent>
                  <LocationChart data={analytics?.byLocation || []} />
                </CardContent>
              </Card>

              <Card className="shadow-card lg:col-span-2">
                <CardHeader>
                  <CardTitle>Root Cause Categories</CardTitle>
                  <CardDescription>Common contributing factors</CardDescription>
                </CardHeader>
                <CardContent>
                  <RootCauseChart data={analytics?.rootCauses || []} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="comparison">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Fleet Comparison</CardTitle>
                <CardDescription>Performance metrics across vessels</CardDescription>
              </CardHeader>
              <CardContent>
                <VesselComparisonTable data={vesselComparison || []} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default IncidentAnalytics;
