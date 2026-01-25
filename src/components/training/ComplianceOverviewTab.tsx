import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTraining } from '@/hooks/useTraining';
import { getTrainingStatusColor, getCategoryColor, daysUntilExpiry, COURSE_CATEGORIES } from '@/lib/trainingConstants';
import { format, subMonths } from 'date-fns';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar
} from 'recharts';
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Award,
  Lightbulb,
  Bell
} from 'lucide-react';

const CHART_COLORS = ['#22c55e', '#eab308', '#ef4444', '#6b7280'];

const ComplianceOverviewTab: React.FC = () => {
  const { trainingRecords, courses, complianceStats, isLoading } = useTraining();

  // Distribution by status
  const statusDistribution = useMemo(() => {
    return [
      { name: 'Valid', value: complianceStats.validRecords, color: '#22c55e' },
      { name: 'Expiring Soon', value: complianceStats.expiringSoon, color: '#eab308' },
      { name: 'Expired', value: complianceStats.expired, color: '#ef4444' },
    ].filter(item => item.value > 0);
  }, [complianceStats]);

  // Distribution by category
  const categoryDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    trainingRecords.forEach(record => {
      if (record.course) {
        const category = record.course.course_category;
        counts[category] = (counts[category] || 0) + 1;
      }
    });

    return Object.entries(counts).map(([category, count]) => ({
      name: COURSE_CATEGORIES.find(c => c.value === category)?.label || category,
      value: count,
    }));
  }, [trainingRecords]);

  // Expiry forecast (next 12 months)
  const expiryForecast = useMemo(() => {
    const months: { month: string; count: number }[] = [];
    const now = new Date();
    
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
      
      const count = trainingRecords.filter(record => {
        if (!record.expiry_date) return false;
        const expiry = new Date(record.expiry_date);
        return expiry >= monthStart && expiry <= monthEnd;
      }).length;

      months.push({
        month: format(monthStart, 'MMM yy'),
        count,
      });
    }

    return months;
  }, [trainingRecords]);

  // Expiring soon list (top 10)
  const expiringSoonList = useMemo(() => {
    return trainingRecords
      .filter(r => r.expiry_date && r.status === 'Expiring_Soon')
      .sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime())
      .slice(0, 10);
  }, [trainingRecords]);

  // Insights
  const insights = useMemo(() => {
    const items: { type: 'warning' | 'success' | 'info'; message: string }[] = [];

    if (complianceStats.expired > 0) {
      items.push({
        type: 'warning',
        message: `⚠️ ${complianceStats.expired} certificate(s) have expired and need immediate renewal`,
      });
    }

    if (complianceStats.expiringSoon > 0) {
      items.push({
        type: 'warning',
        message: `⏰ ${complianceStats.expiringSoon} certificate(s) expiring within 90 days`,
      });
    }

    const complianceRate = complianceStats.totalRecords > 0 
      ? Math.round((complianceStats.validRecords / complianceStats.totalRecords) * 100)
      : 0;

    if (complianceRate >= 95) {
      items.push({
        type: 'success',
        message: `✓ Training compliance rate is excellent at ${complianceRate}%`,
      });
    } else if (complianceRate >= 80) {
      items.push({
        type: 'info',
        message: `📊 Training compliance rate is ${complianceRate}% - aim for 95%+`,
      });
    }

    if (complianceStats.activeFamiliarizations > 0) {
      items.push({
        type: 'info',
        message: `📋 ${complianceStats.activeFamiliarizations} crew familiarization(s) in progress`,
      });
    }

    return items;
  }, [complianceStats]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const complianceRate = complianceStats.totalRecords > 0 
    ? Math.round((complianceStats.validRecords / complianceStats.totalRecords) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Award className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{complianceStats.totalRecords}</p>
                <p className="text-xs text-muted-foreground">Total Certificates</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{complianceStats.validRecords}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{complianceStats.expiringSoon}</p>
                <p className="text-xs text-muted-foreground">Expiring Soon</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{complianceStats.expired}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{complianceRate}%</p>
                <p className="text-xs text-muted-foreground">Compliance Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Certificate Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {statusDistribution.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No training records yet
              </div>
            ) : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Training by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryDistribution.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                No training records yet
              </div>
            ) : (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryDistribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={100} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expiry Forecast */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Certificate Expiry Forecast (Next 12 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expiryForecast}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" name="Certificates Expiring" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Insights & Expiring Soon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Insights Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Insights & Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insights.length === 0 ? (
              <p className="text-muted-foreground">No insights available</p>
            ) : (
              <div className="space-y-3">
                {insights.map((insight, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded-lg ${
                      insight.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                      insight.type === 'success' ? 'bg-green-50 border border-green-200' :
                      'bg-blue-50 border border-blue-200'
                    }`}
                  >
                    <p className="text-sm">{insight.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring Soon List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expiringSoonList.length === 0 ? (
              <p className="text-muted-foreground">No certificates expiring soon</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crew</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringSoonList.map(record => {
                    const days = record.expiry_date ? daysUntilExpiry(new Date(record.expiry_date)) : null;
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.user?.first_name} {record.user?.last_name}
                        </TableCell>
                        <TableCell>{record.course?.course_code}</TableCell>
                        <TableCell>
                          {record.expiry_date && format(new Date(record.expiry_date), 'dd MMM yy')}
                        </TableCell>
                        <TableCell>
                          <Badge className={days !== null && days <= 30 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                            {days} days
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ComplianceOverviewTab;
