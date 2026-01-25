import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useTraining } from '@/hooks/useTraining';
import { useCrew } from '@/hooks/useCrew';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
import TrainingRecordsTab from '@/components/training/TrainingRecordsTab';
import FamiliarizationTab from '@/components/training/FamiliarizationTab';
import TrainingMatrixTab from '@/components/training/TrainingMatrixTab';
import ComplianceOverviewTab from '@/components/training/ComplianceOverviewTab';
import AddTrainingModal from '@/components/training/AddTrainingModal';
import FamiliarizationTemplatesModal from '@/components/training/FamiliarizationTemplatesModal';

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Crew Qualified</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{complianceStats.validRecords}</div>
            <p className="text-xs text-muted-foreground">
              Valid training certificates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {complianceStats.expiringSoon}
            </div>
            <p className="text-xs text-muted-foreground">
              Within 90 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Familiarization</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {complianceStats.activeFamiliarizations}
            </div>
            <p className="text-xs text-muted-foreground">
              In progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overdue Training</CardTitle>
            <Award className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {complianceStats.expired}
            </div>
            <p className="text-xs text-muted-foreground">
              Requires immediate action
            </p>
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
