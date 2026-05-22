import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMaintenance, Equipment } from '@/modules/maintenance/hooks/useMaintenance';
import {
  Wrench,
  Plus,
  AlertTriangle,
  Calendar,
  Package,
  Clock,
  Settings,
  ClipboardList,
  RefreshCw
} from 'lucide-react';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import EquipmentRegisterTab from '@/modules/maintenance/components/EquipmentRegisterTab';
import MaintenanceScheduleTab from '@/modules/maintenance/components/MaintenanceScheduleTab';
import DefectsTab from '@/modules/maintenance/components/DefectsTab';
import RunningHoursTab from '@/modules/maintenance/components/RunningHoursTab';
import SparePartsTab from '@/modules/maintenance/components/SparePartsTab';
import TaskTemplatesTab from '@/modules/maintenance/components/TaskTemplatesTab';
import AddEquipmentModal from '@/modules/maintenance/components/AddEquipmentModal';
import CreateTaskModal from '@/modules/maintenance/components/CreateTaskModal';
import LogDefectModal from '@/modules/maintenance/components/LogDefectModal';
import EquipmentDetailModal from '@/modules/maintenance/components/EquipmentDetailModal';

const Maintenance: React.FC = () => {
  const { stats, tasks, defects, isLoading } = useMaintenance();
  const [activeTab, setActiveTab] = useState('equipment');
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showLogDefect, setShowLogDefect] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [showEquipmentDetail, setShowEquipmentDetail] = useState(false);
  const [preselectedEquipmentId, setPreselectedEquipmentId] = useState<string | null>(null);

  const handleViewEquipment = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setShowEquipmentDetail(true);
  };

  const handleCreateTaskForEquipment = (equipmentId: string) => {
    setPreselectedEquipmentId(equipmentId);
    setShowCreateTask(true);
    setShowEquipmentDetail(false);
  };

  const handleLogDefectForEquipment = (equipmentId: string) => {
    setPreselectedEquipmentId(equipmentId);
    setShowLogDefect(true);
    setShowEquipmentDetail(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Planned Maintenance System"
          description="ISM Code Section 10 - Maintenance of Ship & Equipment"
          actions={
            <>
              <Button variant="outline" onClick={() => setShowAddEquipment(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Equipment
              </Button>
              <Button variant="outline" onClick={() => setShowCreateTask(true)}>
                <ClipboardList className="h-4 w-4 mr-2" />
                Create Task
              </Button>
              <Button onClick={() => setShowLogDefect(true)}>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Log Defect
              </Button>
            </>
          }
        />

        {/* Summary Cards */}
        <StatGrid cols={5}>
          <StatCard
            label="Total Equipment"
            value={stats.totalEquipment}
            icon={<Settings className="h-4 w-4 text-muted-foreground" />}
            hint="Registered items"
          />
          <StatCard
            label="Overdue Tasks"
            value={stats.overdueTasks}
            tone={stats.overdueTasks > 0 ? 'danger' : 'default'}
            icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            hint="Require attention"
          />
          <StatCard
            label="Critical Defects"
            value={stats.criticalDefects}
            tone={stats.criticalDefects > 0 ? 'danger' : 'default'}
            icon={<Wrench className="h-4 w-4 text-muted-foreground" />}
            hint="Open P1 issues"
          />
          <StatCard
            label="Due This Week"
            value={stats.tasksDueThisWeek}
            tone="warning"
            icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
            hint="Upcoming tasks"
          />
          <StatCard
            label="Low Stock Parts"
            value={stats.lowStockParts}
            tone={stats.lowStockParts > 0 ? 'warning' : 'default'}
            icon={<Package className="h-4 w-4 text-muted-foreground" />}
            hint="Below minimum"
          />
        </StatGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="equipment" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Equipment</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Schedule</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Templates</span>
            </TabsTrigger>
            <TabsTrigger value="defects" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Defects</span>
            </TabsTrigger>
            <TabsTrigger value="hours" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Hours</span>
            </TabsTrigger>
            <TabsTrigger value="spares" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Spares</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="equipment">
            <EquipmentRegisterTab 
              onAddEquipment={() => setShowAddEquipment(true)} 
              onViewEquipment={handleViewEquipment}
            />
          </TabsContent>

          <TabsContent value="schedule">
            <MaintenanceScheduleTab onCreateTask={() => setShowCreateTask(true)} />
          </TabsContent>

          <TabsContent value="templates">
            <TaskTemplatesTab />
          </TabsContent>

          <TabsContent value="defects">
            <DefectsTab onLogDefect={() => setShowLogDefect(true)} />
          </TabsContent>

          <TabsContent value="hours">
            <RunningHoursTab />
          </TabsContent>

          <TabsContent value="spares">
            <SparePartsTab />
          </TabsContent>
        </Tabs>

        {/* Modals */}
        <AddEquipmentModal 
          open={showAddEquipment} 
          onOpenChange={setShowAddEquipment} 
        />
        <CreateTaskModal 
          open={showCreateTask} 
          onOpenChange={(open) => {
            setShowCreateTask(open);
            if (!open) setPreselectedEquipmentId(null);
          }}
        />
        <LogDefectModal 
          open={showLogDefect} 
          onOpenChange={(open) => {
            setShowLogDefect(open);
            if (!open) setPreselectedEquipmentId(null);
          }}
        />
        <EquipmentDetailModal
          open={showEquipmentDetail}
          onOpenChange={setShowEquipmentDetail}
          equipment={selectedEquipment}
          tasks={tasks}
          defects={defects}
          onCreateTask={handleCreateTaskForEquipment}
          onLogDefect={handleLogDefectForEquipment}
        />
      </div>
    </DashboardLayout>
  );
};

export default Maintenance;
