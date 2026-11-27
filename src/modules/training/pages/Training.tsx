import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTraining } from '@/modules/training/hooks/useTraining';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_PATHS } from '@/modules/crew/paths';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import {
  GraduationCap,
  Award,
  AlertTriangle,
  Plus,
  Grid3X3,
  ClipboardCheck,
  ShieldCheck,
} from 'lucide-react';
import TrainingRecordsTab from '@/modules/training/components/TrainingRecordsTab';
import TrainingMatrixTab from '@/modules/training/components/TrainingMatrixTab';
import ComplianceOverviewTab from '@/modules/training/components/ComplianceOverviewTab';
import AddTrainingModal from '@/modules/training/components/AddTrainingModal';

/**
 * Crew training records (/training and /ism/training). X1-06B: this page is
 * no longer a compliance source. Who needs which certificate is set per
 * position in Crew Compliance (the requirement engine, gap/04 C35); the
 * "Course records" tab shows the training records by course and nothing
 * more, and the overview keeps its charts of the records. X1-10:
 * familiarisation left this page for its own, per vessel and position, at
 * crew/familiarisation (the legacy tab lives on there as the fallback
 * while the crew update is not applied); this page points to it.
 */
const Training: React.FC = () => {
  const { complianceStats } = useTraining();
  const scopedPath = useScopedPath();
  const [activeTab, setActiveTab] = useState('records');
  const [showAddTraining, setShowAddTraining] = useState(false);

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Crew Training & Competency</h1>
          <p className="text-muted-foreground">ISM Code Section 6 - Training & Familiarization</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowAddTraining(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Training Record
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1">
            <CardTitle className="text-xs font-medium">Valid records</CardTitle>
            <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold">{complianceStats.validRecords}</div>
            <p className="text-[10px] text-muted-foreground">Training records in date</p>
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
            <CardTitle className="text-xs font-medium">Overdue Training</CardTitle>
            <Award className="h-3.5 w-3.5 text-destructive" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-destructive">{complianceStats.expired}</div>
            <p className="text-[10px] text-muted-foreground">Requires action</p>
          </CardContent>
        </Card>
      </div>

      <Alert variant="info" data-training-compliance-pointer="">
        <ShieldCheck aria-hidden="true" className="size-4" />
        <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Which training each position needs, and who is missing it, is in Crew Compliance.
          <Link
            to={`${scopedPath('crew/compliance/status')}?view=stcw`}
            className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-ring"
          >
            Open crew compliance
          </Link>
        </AlertDescription>
      </Alert>

      <Alert variant="info" data-training-familiarisation-pointer="">
        <ClipboardCheck aria-hidden="true" className="size-4" />
        <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Familiarisation is kept per vessel and position on its own page.
          <Link
            to={scopedPath(CREW_PATHS.familiarisation)}
            className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-ring"
          >
            Open familiarisation
          </Link>
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="records" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            <span className="hidden sm:inline">Training Records</span>
            <span className="sm:hidden">Records</span>
          </TabsTrigger>
          <TabsTrigger value="matrix" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            <span className="hidden sm:inline">Course records</span>
            <span className="sm:hidden">Courses</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            <span className="hidden sm:inline">Records overview</span>
            <span className="sm:hidden">Overview</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records">
          <TrainingRecordsTab onAddTraining={() => setShowAddTraining(true)} />
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
    </div>
    </DashboardLayout>
  );
};

export default Training;
