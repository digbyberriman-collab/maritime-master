import React, { useState } from 'react';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useTraining } from '@/modules/training/hooks/useTraining';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { 
  GraduationCap, 
  Award, 
  AlertTriangle, 
  Users, 
  Plus,
  Grid3X3,
  FileText,
  ClipboardCheck
} from 'lucide-react';
import TrainingRecordsTab from '@/modules/training/components/TrainingRecordsTab';
import FamiliarizationTab from '@/modules/training/components/FamiliarizationTab';
import TrainingMatrixTab from '@/modules/training/components/TrainingMatrixTab';
import ComplianceOverviewTab from '@/modules/training/components/ComplianceOverviewTab';
import AddTrainingModal from '@/modules/training/components/AddTrainingModal';
import FamiliarizationTemplatesModal from '@/modules/training/components/FamiliarizationTemplatesModal';

const Training: React.FC = () => {
  const { complianceStats, isLoading } = useTraining();
  const { crew } = useCrew();
  const [activeTab, setActiveTab] = useState('records');
  const [showAddTraining, setShowAddTraining] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Calculate crew fully qualified percentage
  const totalCrew = crew.length;
  const crewWithValidTraining = new Set(
    crew.filter(c => {
      // This would need more complex logic in practice
      return true; // Placeholder
    }).map(c => c.user_id)
  ).size;
  const qualifiedPercentage = totalCrew > 0 
    ? Math.round((crewWithValidTraining / totalCrew) * 100) 
    : 0;

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <PageHeader
        title="Crew Training & Competency"
        description="ISM Code Section 6 - Training & Familiarization"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowTemplates(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Familiarization Templates
            </Button>
            <Button onClick={() => setShowAddTraining(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Training Record
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard
          label="Crew Qualified"
          icon={<GraduationCap className="h-4 w-4 text-muted-foreground" />}
          value={complianceStats.validRecords}
          hint="Valid certificates"
        />
        <StatCard
          label="Expiring Soon"
          icon={<AlertTriangle className="h-4 w-4 text-warning" />}
          value={complianceStats.expiringSoon}
          tone="warning"
          hint="Within 90 days"
        />
        <StatCard
          label="Familiarization"
          icon={<ClipboardCheck className="h-4 w-4 text-info" />}
          value={complianceStats.activeFamiliarizations}
          tone="info"
          hint="In progress"
        />
        <StatCard
          label="Overdue Training"
          icon={<Award className="h-4 w-4 text-destructive" />}
          value={complianceStats.expired}
          tone="danger"
          hint="Requires action"
        />
      </StatGrid>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="records" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            <span className="hidden sm:inline">Training Records</span>
            <span className="sm:hidden">Records</span>
          </TabsTrigger>
          <TabsTrigger value="familiarization" className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Familiarization</span>
            <span className="sm:hidden">Famil.</span>
          </TabsTrigger>
          <TabsTrigger value="matrix" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            <span className="hidden sm:inline">Training Matrix</span>
            <span className="sm:hidden">Matrix</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            <span className="hidden sm:inline">Compliance Overview</span>
            <span className="sm:hidden">Compliance</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records">
          <TrainingRecordsTab onAddTraining={() => setShowAddTraining(true)} />
        </TabsContent>

        <TabsContent value="familiarization">
          <FamiliarizationTab />
        </TabsContent>

        <TabsContent value="matrix">
          <TrainingMatrixTab />
        </TabsContent>

        <TabsContent value="compliance">
          <ComplianceOverviewTab />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <AddTrainingModal 
        open={showAddTraining} 
        onOpenChange={setShowAddTraining} 
      />
      <FamiliarizationTemplatesModal
        open={showTemplates}
        onOpenChange={setShowTemplates}
      />
    </div>
    </DashboardLayout>
  );
};

export default Training;
