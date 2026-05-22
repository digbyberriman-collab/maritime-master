import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, AlertTriangle, CheckCircle, Phone, FileText } from 'lucide-react';
import { useDrills } from '@/modules/drills/hooks/useDrills';
import { format } from 'date-fns';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
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
        <PageHeader
          title="Drills & Emergency Preparedness"
          description="Manage drills, emergency contacts, and procedures"
          actions={
            <>
              <Button onClick={() => setShowScheduleDrillModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Schedule Drill
              </Button>
              <Button variant="outline" onClick={() => setShowContactsModal(true)}>
                <Phone className="w-4 h-4 mr-2" />
                Emergency Contacts
              </Button>
            </>
          }
        />

        <StatGrid>
          <StatCard
            label="Drills This Year"
            icon={<CheckCircle className="h-4 w-4 text-muted-foreground" />}
            value={thisYearDrills.length}
            hint={`${completedDrillsThisYear.length} completed`}
          />
          <StatCard
            label="Next Scheduled Drill"
            icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
            value={
              nextScheduledDrill
                ? format(new Date(nextScheduledDrill.drill_date_scheduled), 'MMM d')
                : <span className="text-sm text-muted-foreground">No drills scheduled</span>
            }
            hint={nextScheduledDrill ? nextScheduledDrill.drill_type?.drill_name || 'Drill' : undefined}
          />
          <StatCard
            label="Compliance Rate"
            icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            value={`${complianceRate}%`}
            hint="Required drills completed on time"
          />
          <StatCard
            label="Overdue Drills"
            icon={<AlertTriangle className={`h-4 w-4 ${overdueDrills.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />}
            value={overdueDrills.length}
            tone={overdueDrills.length > 0 ? 'danger' : 'default'}
            hint={overdueDrills.length > 0 ? 'Require immediate attention' : 'All drills on schedule'}
          />
        </StatGrid>

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
