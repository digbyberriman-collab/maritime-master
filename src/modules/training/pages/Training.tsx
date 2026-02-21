import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Crew Training & Competency</h1>
          <p className="text-muted-foreground">ISM Code Section 6 - Training & Familiarization</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTemplates(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Familiarization Templates
          </Button>
          <Button onClick={() => setShowAddTraining(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Training Record
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs font-medium">Crew Qualified</CardTitle>
            <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold">{complianceStats.validRecords}</div>
            <p className="text-[10px] text-muted-foreground">Valid certificates</p>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs font-medium">Expiring Soon</CardTitle>
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-warning">{complianceStats.expiringSoon}</div>
            <p className="text-[10px] text-muted-foreground">Within 90 days</p>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs font-medium">Familiarization</CardTitle>
            <ClipboardCheck className="h-3.5 w-3.5 text-info" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-info">{complianceStats.activeFamiliarizations}</div>
            <p className="text-[10px] text-muted-foreground">In progress</p>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs font-medium">Overdue Training</CardTitle>
            <Award className="h-3.5 w-3.5 text-destructive" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-destructive">{complianceStats.expired}</div>
            <p className="text-[10px] text-muted-foreground">Requires action</p>
          </CardContent>
        </Card>
      </div>

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
