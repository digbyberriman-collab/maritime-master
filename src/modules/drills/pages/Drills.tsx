import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Calendar, AlertTriangle, CheckCircle, Phone, FileText } from 'lucide-react';
import { useDrills } from '@/modules/drills/hooks/useDrills';
import { format, differenceInDays } from 'date-fns';
import DrillScheduleTab from '@/modules/drills/components/DrillScheduleTab';
import DrillHistoryTab from '@/modules/drills/components/DrillHistoryTab';
import EmergencyProceduresTab from '@/modules/drills/components/EmergencyProceduresTab';
import EquipmentReadinessTab from '@/modules/drills/components/EquipmentReadinessTab';
import ScheduleDrillModal from '@/modules/drills/components/ScheduleDrillModal';
import EmergencyContactsModal from '@/modules/drills/components/EmergencyContactsModal';

const Drills: React.FC = () => {
  const [activeTab, setActiveTab] = useState('schedule');
  const [showScheduleDrillModal, setShowScheduleDrillModal] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);

  const { 
    drills, 
    thisYearDrills, 
    nextScheduledDrill, 
    drillTypes,
    isLoading 
  } = useDrills();

  // Calculate compliance rate
  const completedDrillsThisYear = thisYearDrills.filter(d => d.status === 'Completed');
  const scheduledDrillsThisYear = thisYearDrills.filter(d => ['Scheduled', 'Completed'].includes(d.status));
  const complianceRate = scheduledDrillsThisYear.length > 0 
    ? Math.round((completedDrillsThisYear.length / scheduledDrillsThisYear.length) * 100)
    : 100;

  // Calculate overdue drills
  const today = new Date();
  const overdueDrills = drills.filter(d => 
    d.status === 'Scheduled' && 
    new Date(d.drill_date_scheduled) < today
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Drills & Emergency Preparedness</h1>
            <p className="text-muted-foreground">Manage drills, emergency contacts, and procedures</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowScheduleDrillModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule Drill
            </Button>
            <Button variant="outline" onClick={() => setShowContactsModal(true)}>
              <Phone className="w-4 h-4 mr-2" />
              Emergency Contacts
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drills This Year</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{thisYearDrills.length}</div>
              <p className="text-xs text-muted-foreground">
                {completedDrillsThisYear.length} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Scheduled Drill</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {nextScheduledDrill ? (
                <>
                  <div className="text-2xl font-bold">
                    {format(new Date(nextScheduledDrill.drill_date_scheduled), 'MMM d')}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {nextScheduledDrill.drill_type?.drill_name || 'Drill'}
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No drills scheduled</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compliance Rate</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{complianceRate}%</div>
              <p className="text-xs text-muted-foreground">
                Required drills completed on time
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue Drills</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${overdueDrills.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${overdueDrills.length > 0 ? 'text-red-500' : ''}`}>
                {overdueDrills.length}
              </div>
              <p className="text-xs text-muted-foreground">
                {overdueDrills.length > 0 ? 'Require immediate attention' : 'All drills on schedule'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="schedule">Drill Schedule</TabsTrigger>
            <TabsTrigger value="history">Drill History</TabsTrigger>
            <TabsTrigger value="procedures">Emergency Procedures</TabsTrigger>
            <TabsTrigger value="equipment">Equipment Readiness</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-4">
            <DrillScheduleTab onScheduleDrill={() => setShowScheduleDrillModal(true)} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <DrillHistoryTab />
          </TabsContent>

          <TabsContent value="procedures" className="mt-4">
            <EmergencyProceduresTab />
          </TabsContent>

          <TabsContent value="equipment" className="mt-4">
            <EquipmentReadinessTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <ScheduleDrillModal
        open={showScheduleDrillModal}
        onOpenChange={setShowScheduleDrillModal}
      />
      <EmergencyContactsModal
        open={showContactsModal}
        onOpenChange={setShowContactsModal}
      />
    </DashboardLayout>
  );
};

export default Drills;
