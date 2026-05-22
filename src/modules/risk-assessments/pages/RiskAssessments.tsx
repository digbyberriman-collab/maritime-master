import { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, FileCheck, ClipboardList, CalendarClock } from 'lucide-react';
import { useRiskAssessmentStats, useWorkPermitStats } from '@/modules/risk-assessments/hooks/useRiskAssessments';
import RiskAssessmentsTab from '@/modules/risk-assessments/components/RiskAssessmentsTab';
import WorkPermitsTab from '@/modules/risk-assessments/components/WorkPermitsTab';
import RATemplatesTab from '@/modules/risk-assessments/components/RATemplatesTab';
import CreateRiskAssessmentModal from '@/modules/risk-assessments/components/CreateRiskAssessmentModal';

const RiskAssessments = () => {
  const [activeTab, setActiveTab] = useState('risk-assessments');
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const { data: raStats } = useRiskAssessmentStats();
  const { data: wpStats } = useWorkPermitStats();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Risk Assessments & Work Permits"
          description="Manage risk assessments and control hazardous work activities"
          actions={
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Risk Assessment
            </Button>
          }
        />

        <StatGrid>
          <StatCard
            label="Total Risk Assessments"
            icon={<FileCheck className="h-4 w-4 text-muted-foreground" />}
            value={raStats?.totalAssessments || 0}
            hint="Active assessments"
          />
          <StatCard
            label="High Risk Tasks"
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            value={raStats?.highRiskTasks || 0}
            tone="danger"
            hint="Residual risk >15"
          />
          <StatCard
            label="Due for Review"
            icon={<CalendarClock className="h-4 w-4 text-yellow-600" />}
            value={raStats?.dueForReview || 0}
            tone="warning"
            hint="Within 30 days"
          />
          <StatCard
            label="Active Work Permits"
            icon={<ClipboardList className="h-4 w-4 text-primary" />}
            value={wpStats?.activePermits || 0}
            hint={`${wpStats?.pendingPermits || 0} pending approval`}
          />
        </StatGrid>

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
