import React from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useRiskAssessments } from '@/modules/risk-assessments/hooks/useRiskAssessments';
import { useIncidents } from '@/modules/incidents/hooks/useIncidents';
import { useCorrectiveActions } from '@/modules/incidents/hooks/useCorrectiveActions';
import { useAudits } from '@/modules/audits/hooks/useAudits';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
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
  const { audits = [], openFindings = [] } = useAudits();

  // Calculate risk metrics based on risk_score_initial
  const highRiskCount = riskAssessments.filter(r => (r.risk_score_initial ?? 0) >= 15).length;
  const mediumRiskCount = riskAssessments.filter(r => (r.risk_score_initial ?? 0) >= 8 && (r.risk_score_initial ?? 0) < 15).length;
  const lowRiskCount = riskAssessments.filter(r => (r.risk_score_initial ?? 0) < 8).length;
  const totalRisks = riskAssessments.length;
  const openFindingsCount = openFindings.length;

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
        <PageHeader
          icon={<Shield className="w-6 h-6" />}
          title="Enterprise Risk Management"
          description="Overview of organizational risk posture and safety performance"
          actions={
            <Button>
              <BarChart3 className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
          }
        />

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

        <StatGrid cols={4}>
          <StatCard
            label="High/Critical Risks"
            value={highRiskCount}
            icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
            tone={highRiskCount > 0 ? 'danger' : 'default'}
            hint={
              <>
                of {totalRisks} total risks
                <Button variant="link" size="sm" className="px-0 mt-2 block">
                  View Details <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </>
            }
          />
          <StatCard
            label="Open Incidents"
            value={openIncidents}
            icon={<FileWarning className="w-4 h-4 text-orange-500" />}
            tone={openIncidents > 0 ? 'warning' : 'default'}
            hint={
              <>
                {recentIncidents} in last 30 days
                <Button variant="link" size="sm" className="px-0 mt-2 block">
                  View Details <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </>
            }
          />
          <StatCard
            label="Open Actions"
            value={openCAPAs}
            icon={<Clock className="w-4 h-4 text-yellow-500" />}
            hint={
              <>
                <span className={overdueCAPAs > 0 ? "text-red-600 font-medium" : ""}>
                  {overdueCAPAs} overdue
                </span>
                <Button variant="link" size="sm" className="px-0 mt-2 block">
                  View Details <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </>
            }
          />
          <StatCard
            label="Audit Findings"
            value={openFindingsCount}
            icon={<Target className="w-4 h-4 text-purple-500" />}
            tone={openFindingsCount > 0 ? 'primary' : 'default'}
            hint={
              <>
                Open findings
                <Button variant="link" size="sm" className="px-0 mt-2 block">
                  View Details <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </>
            }
          />
        </StatGrid>

        {/* Risk Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk Distribution</CardTitle>
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
              <CardTitle className="text-base">Quick Actions</CardTitle>
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
            <CardTitle className="text-base">Key Performance Indicators</CardTitle>
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
