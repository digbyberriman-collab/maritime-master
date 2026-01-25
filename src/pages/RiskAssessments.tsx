import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, FileCheck, ClipboardList, CalendarClock } from 'lucide-react';
import { useRiskAssessmentStats, useWorkPermitStats } from '@/hooks/useRiskAssessments';
import RiskAssessmentsTab from '@/components/riskassessments/RiskAssessmentsTab';
import WorkPermitsTab from '@/components/riskassessments/WorkPermitsTab';
import RATemplatesTab from '@/components/riskassessments/RATemplatesTab';
import CreateRiskAssessmentModal from '@/components/riskassessments/CreateRiskAssessmentModal';

const RiskAssessments = () => {
  const [activeTab, setActiveTab] = useState('risk-assessments');
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const { data: raStats } = useRiskAssessmentStats();
  const { data: wpStats } = useWorkPermitStats();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Risk Assessments & Work Permits</h1>
            <p className="text-muted-foreground mt-1">
              Manage risk assessments and control hazardous work activities
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Risk Assessment
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Risk Assessments</CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{raStats?.totalAssessments || 0}</div>
              <p className="text-xs text-muted-foreground">Active assessments</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Risk Tasks</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{raStats?.highRiskTasks || 0}</div>
              <p className="text-xs text-muted-foreground">Residual risk &gt;15</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Due for Review</CardTitle>
              <CalendarClock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{raStats?.dueForReview || 0}</div>
              <p className="text-xs text-muted-foreground">Within 30 days</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Work Permits</CardTitle>
              <ClipboardList className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{wpStats?.activePermits || 0}</div>
              <p className="text-xs text-muted-foreground">{wpStats?.pendingPermits || 0} pending approval</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="risk-assessments">Risk Assessments</TabsTrigger>
            <TabsTrigger value="work-permits">Work Permits</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="risk-assessments">
            <RiskAssessmentsTab />
          </TabsContent>

          <TabsContent value="work-permits">
            <WorkPermitsTab />
          </TabsContent>

          <TabsContent value="templates">
            <RATemplatesTab />
          </TabsContent>
        </Tabs>
      </div>

      <CreateRiskAssessmentModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />
    </DashboardLayout>
  );
};

export default RiskAssessments;
