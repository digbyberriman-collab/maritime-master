import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Calendar, 
  Target, 
  Star, 
  AlertTriangle, 
  ClipboardCheck,
  TrendingUp,
  Users,
  Download,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { useDrills, useDrillDetails } from '@/hooks/useDrills';
import { useVessels } from '@/hooks/useVessels';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, differenceInDays } from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { getDrillTypeColor } from '@/lib/drillConstants';

const DrillAnalytics: React.FC = () => {
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('12');

  const { drills, drillTypes, completedDrills, thisYearDrills } = useDrills();
  const { vessels } = useVessels();

  // Filter drills by vessel and date range
  const filteredDrills = useMemo(() => {
    const monthsAgo = subMonths(new Date(), parseInt(dateRange));
    return drills.filter(d => {
      const matchesVessel = selectedVessel === 'all' || d.vessel_id === selectedVessel;
      const drillDate = new Date(d.drill_date_scheduled);
      const matchesDate = drillDate >= monthsAgo;
      return matchesVessel && matchesDate;
    });
  }, [drills, selectedVessel, dateRange]);

  const filteredCompleted = filteredDrills.filter(d => d.status === 'Completed');

  // Calculate metrics
  const totalDrills = filteredDrills.length;
  const completedCount = filteredCompleted.length;
  const avgRating = filteredCompleted.reduce((sum, d) => sum + (d.overall_rating || 0), 0) / (completedCount || 1);
  
  // Calculate compliance rate
  const requiredDrillTypes = drillTypes.filter(t => t.category === 'SOLAS_Required');
  const complianceChecks = requiredDrillTypes.map(type => {
    const drillsOfType = filteredCompleted.filter(d => d.drill_type_id === type.id);
    const requiredCount = Math.ceil(parseInt(dateRange) * 30 / type.minimum_frequency);
    const completed = drillsOfType.length;
    return { type, required: requiredCount, completed, rate: (completed / requiredCount) * 100 };
  });
  const overallCompliance = complianceChecks.length > 0
    ? complianceChecks.reduce((sum, c) => sum + Math.min(c.rate, 100), 0) / complianceChecks.length
    : 100;

  // Monthly drill frequency data
  const monthlyData = useMemo(() => {
    const data: Record<string, Record<string, string | number>> = {};
    const monthsAgo = subMonths(new Date(), parseInt(dateRange));
    
    for (let i = 0; i < parseInt(dateRange); i++) {
      const month = subMonths(new Date(), i);
      const monthKey = format(month, 'MMM yyyy');
      data[monthKey] = { month: monthKey, total: 0 };
      drillTypes.forEach(t => {
        data[monthKey][t.drill_name] = 0;
      });
    }

    filteredCompleted.forEach(drill => {
      const monthKey = format(new Date(drill.drill_date_scheduled), 'MMM yyyy');
      if (data[monthKey]) {
        (data[monthKey].total as number)++;
        if (drill.drill_type) {
          const currentValue = data[monthKey][drill.drill_type.drill_name] as number || 0;
          data[monthKey][drill.drill_type.drill_name] = currentValue + 1;
        }
      }
    });

    return Object.values(data).reverse();
  }, [filteredCompleted, dateRange, drillTypes]);

  // Drill type distribution
  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCompleted.forEach(drill => {
      const typeName = drill.drill_type?.drill_name || 'Unknown';
      counts[typeName] = (counts[typeName] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      color: getDrillTypeColor(name)
    }));
  }, [filteredCompleted]);

  // Performance trend data
  const performanceTrend = useMemo(() => {
    const data: Record<string, { month: string; rating: number; count: number }> = {};
    
    filteredCompleted.forEach(drill => {
      if (drill.overall_rating) {
        const monthKey = format(new Date(drill.drill_date_scheduled), 'MMM yyyy');
        if (!data[monthKey]) {
          data[monthKey] = { month: monthKey, rating: 0, count: 0 };
        }
        data[monthKey].rating += drill.overall_rating;
        data[monthKey].count++;
      }
    });

    return Object.values(data).map(d => ({
      month: d.month,
      rating: d.rating / d.count
    })).reverse();
  }, [filteredCompleted]);

  // Insights
  const insights = useMemo(() => {
    const items: { type: 'warning' | 'success' | 'info'; message: string }[] = [];
    
    // Check for overdue drills
    requiredDrillTypes.forEach(type => {
      const lastDrill = filteredCompleted
        .filter(d => d.drill_type_id === type.id)
        .sort((a, b) => new Date(b.drill_date_scheduled).getTime() - new Date(a.drill_date_scheduled).getTime())[0];
      
      if (lastDrill) {
        const daysSince = differenceInDays(new Date(), new Date(lastDrill.drill_date_scheduled));
        if (daysSince > type.minimum_frequency) {
          items.push({
            type: 'warning',
            message: `⚠️ ${type.drill_name} overdue by ${daysSince - type.minimum_frequency} days`
          });
        } else if (type.minimum_frequency - daysSince <= 7) {
          items.push({
            type: 'info',
            message: `⏰ ${type.drill_name} due in ${type.minimum_frequency - daysSince} days`
          });
        }
      }
    });

    // Performance insights
    if (avgRating >= 4.5) {
      items.push({
        type: 'success',
        message: `✓ Drills consistently achieving ${avgRating.toFixed(1)} star rating`
      });
    }

    // Compliance insights
    if (overallCompliance >= 90) {
      items.push({
        type: 'success',
        message: `📊 Drill compliance rate at ${overallCompliance.toFixed(0)}%`
      });
    }

    return items;
  }, [filteredCompleted, requiredDrillTypes, avgRating, overallCompliance]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Drill Analytics</h1>
            <p className="text-muted-foreground">
              Performance insights and compliance tracking
            </p>
          </div>
          <div className="flex gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Last 3 Months</SelectItem>
                <SelectItem value="6">Last 6 Months</SelectItem>
                <SelectItem value="12">Last 12 Months</SelectItem>
                <SelectItem value="24">Last 24 Months</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedVessel} onValueChange={setSelectedVessel}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Vessels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vessels</SelectItem>
                {vessels.map(vessel => (
                  <SelectItem key={vessel.id} value={vessel.id}>
                    {vessel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Top Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Drills</span>
              </div>
              <p className="text-2xl font-bold mt-1">{totalDrills}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Compliance</span>
              </div>
              <p className={`text-2xl font-bold mt-1 ${overallCompliance >= 90 ? 'text-green-600' : overallCompliance >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                {overallCompliance.toFixed(0)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Avg Rating</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <p className="text-2xl font-bold">{avgRating.toFixed(1)}</p>
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Deficiencies</span>
              </div>
              <p className="text-2xl font-bold mt-1">0</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">CAPAs</span>
              </div>
              <p className="text-2xl font-bold mt-1">0</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Drill Frequency Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Drill Frequency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      name="Total Drills"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Drill Type Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Drill Type Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {typeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-4">
                {typeDistribution.slice(0, 5).map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <span className="font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Compliance Tracker */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compliance Tracker</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {complianceChecks.map(check => (
                  <div key={check.type.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{check.type.drill_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {check.completed}/{check.required}
                        </span>
                        {check.rate >= 100 ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : check.rate >= 70 ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </div>
                    <Progress 
                      value={Math.min(check.rate, 100)} 
                      className={`h-2 ${
                        check.rate >= 100 ? '[&>div]:bg-green-500' : 
                        check.rate >= 70 ? '[&>div]:bg-yellow-500' : 
                        '[&>div]:bg-red-500'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Performance Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis domain={[0, 5]} fontSize={12} />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="rating" 
                      stroke="#eab308" 
                      strokeWidth={2}
                      dot={{ fill: '#eab308' }}
                      name="Average Rating"
                    />
                    {/* Target line at 4.0 */}
                    <Line 
                      type="monotone" 
                      dataKey={() => 4} 
                      stroke="#22c55e" 
                      strokeDasharray="5 5"
                      strokeWidth={1}
                      dot={false}
                      name="Target"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Insights Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Insights & Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insights.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {insights.map((insight, idx) => (
                  <div 
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      insight.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                      insight.type === 'success' ? 'bg-green-50 border-green-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <p className="text-sm">{insight.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No insights available for the selected period
              </p>
            )}
          </CardContent>
        </Card>

        {/* Drill Performance Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Drill Performance Details</CardTitle>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export to Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drill #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Objectives</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Deficiencies</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompleted.slice(0, 10).map(drill => (
                  <TableRow key={drill.id}>
                    <TableCell className="font-medium">{drill.drill_number}</TableCell>
                    <TableCell>
                      <Badge 
                        style={{ 
                          backgroundColor: getDrillTypeColor(drill.drill_type?.drill_name || ''),
                          color: 'white'
                        }}
                      >
                        {drill.drill_type?.drill_name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(drill.drill_date_scheduled), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {drill.objectives?.length || 0} defined
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {drill.overall_rating || '—'}
                        {drill.overall_rating && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                      </div>
                    </TableCell>
                    <TableCell>—</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">
                        Completed
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Vessel Comparison (if multiple vessels) */}
        {vessels.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vessel Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Drills Completed</TableHead>
                    <TableHead>Compliance Rate</TableHead>
                    <TableHead>Avg Performance</TableHead>
                    <TableHead>Deficiencies</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vessels.map(vessel => {
                    const vesselDrills = filteredCompleted.filter(d => d.vessel_id === vessel.id);
                    const vesselAvgRating = vesselDrills.reduce((sum, d) => sum + (d.overall_rating || 0), 0) / (vesselDrills.length || 1);
                    
                    return (
                      <TableRow key={vessel.id}>
                        <TableCell className="font-medium">{vessel.name}</TableCell>
                        <TableCell>{vesselDrills.length}</TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">100%</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {vesselAvgRating.toFixed(1)}
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          </div>
                        </TableCell>
                        <TableCell>0</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DrillAnalytics;
