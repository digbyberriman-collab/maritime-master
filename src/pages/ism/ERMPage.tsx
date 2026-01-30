import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useRiskAssessments } from '@/hooks/useRiskAssessments';
import { useIncidents } from '@/hooks/useIncidents';
import { useCorrectiveActions } from '@/hooks/useCorrectiveActions';
import { useAudits } from '@/hooks/useAudits';
import { 
  Shield, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  ArrowRight,
  BarChart3,
  Target,
  Activity,
  FileWarning,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isPast } from 'date-fns';

const ERMPage: React.FC = () => {
  // Fetch data from various sources
  const { data: riskAssessments = [] } = useRiskAssessments();
  const { data: incidents = [] } = useIncidents({});
  const { data: actions = [] } = useCorrectiveActions();
  const { audits = [], openFindings = 0 } = useAudits();

  // Calculate risk metrics
  const highRiskCount = riskAssessments.filter(r => r.risk_level === 'High' || r.risk_level === 'Critical').length;
  const mediumRiskCount = riskAssessments.filter(r => r.risk_level === 'Medium').length;
  const lowRiskCount = riskAssessments.filter(r => r.risk_level === 'Low').length;
  const totalRisks = riskAssessments.length;

  // Calculate incident metrics
  const openIncidents = incidents.filter(i => i.status === 'Open' || i.status === 'Under Investigation').length;
  const recentIncidents = incidents.filter(i => {
    const date = new Date(i.incident_date);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return date >= thirtyDaysAgo;
  }).length;

  // Calculate CAPA metrics
  const openCAPAs = actions.filter(a => a.status === 'Open' || a.status === 'In Progress').length;
  const overdueCAPAs = actions.filter(a => 
    ['Open', 'In Progress'].includes(a.status) && isPast(new Date(a.due_date))
  ).length;

  // Calculate overall risk score (simplified)
  const riskScore = Math.max(0, 100 - (highRiskCount * 10) - (openIncidents * 5) - (overdueCAPAs * 8));

  const getRiskScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getRiskScoreLabel = (score: number) => {
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Moderate';
    if (score >= 40) return 'Elevated';
    return 'High Risk';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Enterprise Risk Management</h1>
            </div>
            <p className="text-muted-foreground">
              Overview of organizational risk posture and safety performance
            </p>
          </div>
          <Button>
            <BarChart3 className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </div>

        {/* Overall Risk Score */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-muted-foreground">Overall Risk Score</h2>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className={cn("text-5xl font-bold", getRiskScoreColor(riskScore))}>
                    {riskScore}
                  </span>
                  <span className="text-2xl text-muted-foreground">/100</span>
                </div>
                <Badge className={cn(
                  "mt-2",
                  riskScore >= 80 ? "bg-green-500" :
                  riskScore >= 60 ? "bg-yellow-500" :
                  riskScore >= 40 ? "bg-orange-500" : "bg-red-500",
                  "text-white"
                )}>
                  {getRiskScoreLabel(riskScore)}
                </Badge>
              </div>
              <div className="text-right">
                <Activity className="h-16 w-16 text-primary/30" />
              </div>
            </div>
            <Progress value={riskScore} className="mt-4 h-2" />
          </CardContent>
        </Card>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High/Critical Risks</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", highRiskCount > 0 && "text-red-600")}>
                {highRiskCount}
              </div>
              <p className="text-xs text-muted-foreground">
                of {totalRisks} total risks
              </p>
              <Button variant="link" size="sm" className="px-0 mt-2">
                View Details <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
              <FileWarning className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", openIncidents > 0 && "text-orange-600")}>
                {openIncidents}
              </div>
              <p className="text-xs text-muted-foreground">
                {recentIncidents} in last 30 days
              </p>
              <Button variant="link" size="sm" className="px-0 mt-2">
                View Details <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Actions</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{openCAPAs}</div>
              <p className="text-xs text-muted-foreground">
                <span className={overdueCAPAs > 0 ? "text-red-600 font-medium" : ""}>
                  {overdueCAPAs} overdue
                </span>
              </p>
              <Button variant="link" size="sm" className="px-0 mt-2">
                View Details <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Audit Findings</CardTitle>
              <Target className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", openFindings > 0 && "text-purple-600")}>
                {openFindings}
              </div>
              <p className="text-xs text-muted-foreground">
                Open findings
              </p>
              <Button variant="link" size="sm" className="px-0 mt-2">
                View Details <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Risk Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Risk Distribution</CardTitle>
              <CardDescription>Active risk assessments by level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span>High/Critical</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{highRiskCount}</span>
                    <Progress value={totalRisks ? (highRiskCount/totalRisks)*100 : 0} className="w-24 h-2" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <span>Medium</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{mediumRiskCount}</span>
                    <Progress value={totalRisks ? (mediumRiskCount/totalRisks)*100 : 0} className="w-24 h-2" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>Low</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{lowRiskCount}</span>
                    <Progress value={totalRisks ? (lowRiskCount/totalRisks)*100 : 0} className="w-24 h-2" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common risk management tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="justify-start">
                  <AlertTriangle className="w-4 h-4 mr-2 text-red-500" />
                  Report Incident
                </Button>
                <Button variant="outline" className="justify-start">
                  <Shield className="w-4 h-4 mr-2 text-blue-500" />
                  New Risk Assessment
                </Button>
                <Button variant="outline" className="justify-start">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                  Create CAPA
                </Button>
                <Button variant="outline" className="justify-start">
                  <TrendingUp className="w-4 h-4 mr-2 text-purple-500" />
                  View Trends
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Key Performance Indicators */}
        <Card>
          <CardHeader>
            <CardTitle>Key Performance Indicators</CardTitle>
            <CardDescription>Safety and compliance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {incidents.length > 0 ? Math.round((incidents.filter(i => i.status === 'Closed').length / incidents.length) * 100) : 100}%
                </div>
                <p className="text-sm text-muted-foreground mt-1">Incident Closure Rate</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {actions.length > 0 ? Math.round((actions.filter(a => a.status === 'Closed').length / actions.length) * 100) : 100}%
                </div>
                <p className="text-sm text-muted-foreground mt-1">CAPA Completion Rate</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {audits.length}
                </div>
                <p className="text-sm text-muted-foreground mt-1">Audits This Year</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600">
                  {totalRisks}
                </div>
                <p className="text-sm text-muted-foreground mt-1">Active Risk Assessments</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ERMPage;
