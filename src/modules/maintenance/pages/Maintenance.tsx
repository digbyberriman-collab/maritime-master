import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Planned Maintenance System</h1>
            <p className="text-muted-foreground">ISM Code Section 10 - Maintenance of Ship & Equipment</p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Equipment</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEquipment}</div>
              <p className="text-xs text-muted-foreground">Registered items</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
              <AlertTriangle className="h-4 w-4 text-critical" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.overdueTasks > 0 ? 'text-critical' : ''}`}>
                {stats.overdueTasks}
              </div>
              <p className="text-xs text-muted-foreground">Require attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Critical Defects</CardTitle>
              <Wrench className="h-4 w-4 text-critical" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.criticalDefects > 0 ? 'text-critical' : ''}`}>
                {stats.criticalDefects}
              </div>
              <p className="text-xs text-muted-foreground">Open P1 issues</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
              <Calendar className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.tasksDueThisWeek}</div>
              <p className="text-xs text-muted-foreground">Upcoming tasks</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Low Stock Parts</CardTitle>
              <Package className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.lowStockParts > 0 ? 'text-warning' : ''}`}>
                {stats.lowStockParts}
              </div>
              <p className="text-xs text-muted-foreground">Below minimum</p>
            </CardContent>
          </Card>
        </div>

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
