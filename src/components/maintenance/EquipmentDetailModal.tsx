import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Equipment, MaintenanceTask, Defect } from '@/hooks/useMaintenance';
import { 
  getCriticalityConfig, 
  getEquipmentStatusConfig, 
  getTaskStatusConfig,
  getDefectPriorityConfig,
  getDefectStatusConfig 
} from '@/lib/maintenanceConstants';
import { format } from 'date-fns';
import { 
  Settings, 
  History, 
  FileText, 
  AlertTriangle,
  Clock,
  Wrench,
  Calendar,
  User,
  MapPin,
  Building,
  Package,
  ClipboardList,
  ExternalLink
} from 'lucide-react';

interface EquipmentDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: Equipment | null;
  tasks: MaintenanceTask[];
  defects: Defect[];
  onCreateTask?: (equipmentId: string) => void;
  onLogDefect?: (equipmentId: string) => void;
  onEdit?: (equipment: Equipment) => void;
}

const EquipmentDetailModal: React.FC<EquipmentDetailModalProps> = ({
  open,
  onOpenChange,
  equipment,
  tasks,
  defects,
  onCreateTask,
  onLogDefect,
  onEdit,
}) => {
  const [activeTab, setActiveTab] = useState('profile');

  if (!equipment) return null;

  const equipmentTasks = tasks.filter(t => t.equipment_id === equipment.id);
  const equipmentDefects = defects.filter(d => d.equipment_id === equipment.id);
  const completedTasks = equipmentTasks.filter(t => t.status === 'Completed');
  const pendingTasks = equipmentTasks.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');
  const openDefects = equipmentDefects.filter(d => d.status !== 'Closed');

  const criticalityConfig = getCriticalityConfig(equipment.criticality);
  const statusConfig = getEquipmentStatusConfig(equipment.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl">
                {equipment.equipment_name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                {equipment.equipment_code}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusConfig?.color || ''}>
                {statusConfig?.label || equipment.status}
              </Badge>
              <Badge className={criticalityConfig?.color || ''}>
                {criticalityConfig?.label || equipment.criticality}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="defects" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Defects ({openDefects.length})
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documents
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4 max-h-[60vh]">
            {/* Profile Tab */}
            <TabsContent value="profile" className="mt-0">
              <div className="grid grid-cols-2 gap-4">
                {/* Basic Info Card */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Equipment Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Manufacturer</p>
                        <p className="font-medium">{equipment.manufacturer || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Model</p>
                        <p className="font-medium">{equipment.model || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Serial Number</p>
                        <p className="font-medium font-mono">{equipment.serial_number || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Category</p>
                        <p className="font-medium">{equipment.category?.category_name || '—'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Location & Installation */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Location & Installation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Vessel</p>
                        <p className="font-medium">{equipment.vessel?.name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="font-medium">{equipment.location || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Installation Date</p>
                        <p className="font-medium">
                          {equipment.installation_date 
                            ? format(new Date(equipment.installation_date), 'MMM d, yyyy') 
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Warranty Expiry</p>
                        <p className="font-medium">
                          {equipment.warranty_expiry 
                            ? format(new Date(equipment.warranty_expiry), 'MMM d, yyyy') 
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Running Hours */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Running Hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-bold font-mono">
                        {equipment.running_hours_total.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground mb-1">hours</span>
                    </div>
                    {equipment.running_hours_last_updated && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last updated: {format(new Date(equipment.running_hours_last_updated), 'MMM d, yyyy HH:mm')}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Maintenance Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Maintenance Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-muted rounded">
                        <p className="text-2xl font-bold">{completedTasks.length}</p>
                        <p className="text-xs text-muted-foreground">Completed</p>
                      </div>
                      <div className="p-2 bg-warning-muted rounded">
                        <p className="text-2xl font-bold text-warning">{pendingTasks.length}</p>
                        <p className="text-xs text-muted-foreground">Pending</p>
                      </div>
                      <div className="p-2 bg-critical-muted rounded">
                        <p className="text-2xl font-bold text-critical">{openDefects.length}</p>
                        <p className="text-xs text-muted-foreground">Open Defects</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Specifications */}
                {equipment.specifications && Object.keys(equipment.specifications).length > 0 && (
                  <Card className="col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Technical Specifications</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-3">
                        {Object.entries(equipment.specifications).map(([key, value]) => (
                          <div key={key}>
                            <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                            <p className="font-medium">{value}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <Button variant="outline" onClick={() => onEdit?.(equipment)}>
                  Edit Equipment
                </Button>
                <Button variant="outline" onClick={() => onCreateTask?.(equipment.id)}>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Create Task
                </Button>
                <Button variant="outline" onClick={() => onLogDefect?.(equipment.id)}>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Log Defect
                </Button>
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Maintenance History</CardTitle>
                </CardHeader>
                <CardContent>
                  {equipmentTasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No maintenance history yet</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task #</TableHead>
                          <TableHead>Task Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {equipmentTasks.map(task => {
                          const statusConfig = getTaskStatusConfig(task.status);
                          return (
                            <TableRow key={task.id}>
                              <TableCell className="font-mono">{task.task_number}</TableCell>
                              <TableCell>{task.task_name}</TableCell>
                              <TableCell>{task.task_type}</TableCell>
                              <TableCell>{format(new Date(task.due_date), 'MMM d, yyyy')}</TableCell>
                              <TableCell>
                                {task.actual_completion_date 
                                  ? format(new Date(task.actual_completion_date), 'MMM d, yyyy')
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusConfig?.color || ''}>
                                  {statusConfig?.label || task.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Defects Tab */}
            <TabsContent value="defects" className="mt-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Equipment Defects</CardTitle>
                  <Button size="sm" onClick={() => onLogDefect?.(equipment.id)}>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Log Defect
                  </Button>
                </CardHeader>
                <CardContent>
                  {equipmentDefects.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No defects recorded</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Defect #</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Reported</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {equipmentDefects.map(defect => {
                          const priorityConfig = getDefectPriorityConfig(defect.priority);
                          const statusConfig = getDefectStatusConfig(defect.status);
                          return (
                            <TableRow key={defect.id}>
                              <TableCell className="font-mono">{defect.defect_number}</TableCell>
                              <TableCell className="max-w-[200px] truncate">
                                {defect.defect_description}
                              </TableCell>
                              <TableCell>
                                <Badge className={priorityConfig?.color || ''}>
                                  {priorityConfig?.label || defect.priority}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {format(new Date(defect.reported_date), 'MMM d, yyyy')}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusConfig?.color || ''}>
                                  {statusConfig?.label || defect.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Related Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {equipment.manual_url ? (
                      <a 
                        href={equipment.manual_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 border rounded hover:bg-muted transition-colors"
                      >
                        <FileText className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <p className="font-medium">Equipment Manual</p>
                          <p className="text-xs text-muted-foreground">Manufacturer documentation</p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No documents linked</p>
                        <p className="text-sm">Add manual URL in equipment settings</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default EquipmentDetailModal;
