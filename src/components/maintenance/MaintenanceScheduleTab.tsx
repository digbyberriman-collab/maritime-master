import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMaintenance } from '@/hooks/useMaintenance';
import { getTaskTypeConfig, getTaskStatusConfig, getPriorityConfig } from '@/lib/maintenanceConstants';
import { 
  Plus, 
  Calendar,
  List,
  Columns,
  ChevronLeft,
  ChevronRight,
  Play,
  CheckCircle
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths } from 'date-fns';

interface MaintenanceScheduleTabProps {
  onCreateTask: () => void;
}

const MaintenanceScheduleTab: React.FC<MaintenanceScheduleTabProps> = ({ onCreateTask }) => {
  const { tasks, equipment, updateTask } = useMaintenance();
  const [viewMode, setViewMode] = useState<'calendar' | 'list' | 'kanban'>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesType = typeFilter === 'all' || task.task_type === typeFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    return matchesStatus && matchesType && matchesPriority;
  });

  // Calendar view helpers
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getTasksForDay = (date: Date) => {
    return filteredTasks.filter(task => isSameDay(new Date(task.due_date), date));
  };

  const getTaskStatusColor = (task: typeof tasks[0]) => {
    const dueDate = new Date(task.due_date);
    const today = new Date();
    
    if (task.status === 'Completed') return 'bg-success';
    if (task.status === 'Cancelled') return 'bg-muted';
    if (dueDate < today) return 'bg-critical';
    
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);
    if (dueDate <= weekFromNow) return 'bg-warning';
    
    return 'bg-info';
  };

  // Kanban columns
  const kanbanColumns = [
    { status: 'Pending', label: 'Pending' },
    { status: 'Scheduled', label: 'Scheduled' },
    { status: 'In_Progress', label: 'In Progress' },
    { status: 'Completed', label: 'Completed' },
  ];

  const handleStartTask = async (taskId: string) => {
    await updateTask.mutateAsync({
      id: taskId,
      status: 'In_Progress',
      actual_start_date: new Date().toISOString(),
    });
  };

  const handleCompleteTask = async (taskId: string) => {
    await updateTask.mutateAsync({
      id: taskId,
      status: 'Completed',
      actual_completion_date: new Date().toISOString(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Maintenance Schedule</CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
              <TabsList>
                <TabsTrigger value="list" className="flex items-center gap-1">
                  <List className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="calendar" className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="kanban" className="flex items-center gap-1">
                  <Columns className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={onCreateTask}>
              <Plus className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Scheduled">Scheduled</SelectItem>
              <SelectItem value="In_Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Inspection">Inspection</SelectItem>
              <SelectItem value="Service">Service</SelectItem>
              <SelectItem value="Overhaul">Overhaul</SelectItem>
              <SelectItem value="Calibration">Calibration</SelectItem>
              <SelectItem value="Replacement">Replacement</SelectItem>
              <SelectItem value="Repair">Repair</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Normal">Normal</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {/* List View */}
        {viewMode === 'list' && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task #</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Task Type</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No tasks found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTasks.map((task) => {
                  const typeConfig = getTaskTypeConfig(task.task_type);
                  const statusConfig = getTaskStatusConfig(task.status);
                  const priorityConfig = getPriorityConfig(task.priority);
                  const isOverdue = new Date(task.due_date) < new Date() && task.status !== 'Completed';

                  return (
                    <TableRow key={task.id}>
                      <TableCell className="font-mono font-medium">
                        {task.task_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{task.equipment?.equipment_code}</p>
                          <p className="text-xs text-muted-foreground">
                            {task.equipment?.equipment_name}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={typeConfig?.color || ''}>
                          {typeConfig?.label || task.task_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={isOverdue ? 'text-critical font-medium' : ''}>
                          {format(new Date(task.due_date), 'MMM d, yyyy')}
                        </span>
                      </TableCell>
                      <TableCell>
                        {task.assigned_to ? (
                          `${task.assigned_to.first_name} ${task.assigned_to.last_name}`
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={priorityConfig?.color || ''}>
                          {priorityConfig?.label || task.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={isOverdue && task.status === 'Pending' ? 'bg-critical-muted text-critical' : statusConfig?.color || ''}>
                          {isOverdue && task.status === 'Pending' ? 'Overdue' : statusConfig?.label || task.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {task.status === 'Pending' || task.status === 'Scheduled' ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="Start Task"
                              onClick={() => handleStartTask(task.id)}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          ) : task.status === 'In_Progress' ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              title="Complete Task"
                              onClick={() => handleCompleteTask(task.id)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="font-semibold">{format(currentMonth, 'MMMM yyyy')}</h3>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              {daysInMonth.map(day => {
                const dayTasks = getTasksForDay(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[80px] p-1 border rounded ${
                      !isSameMonth(day, currentMonth) ? 'bg-muted/30' : ''
                    } ${isToday(day) ? 'border-primary' : ''}`}
                  >
                    <div className={`text-xs mb-1 ${isToday(day) ? 'font-bold text-primary' : ''}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map(task => (
                        <div
                          key={task.id}
                          className={`text-xs px-1 py-0.5 rounded truncate text-white ${getTaskStatusColor(task)}`}
                          title={`${task.task_number}: ${task.task_name}`}
                        >
                          {task.equipment?.equipment_code}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{dayTasks.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Kanban View */}
        {viewMode === 'kanban' && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {kanbanColumns.map(column => {
              const columnTasks = filteredTasks.filter(t => t.status === column.status);
              return (
                <div key={column.status} className="flex-shrink-0 w-72">
                  <div className="bg-muted rounded-t-lg p-3">
                    <h4 className="font-medium text-sm">
                      {column.label} ({columnTasks.length})
                    </h4>
                  </div>
                  <div className="bg-muted/30 rounded-b-lg p-2 min-h-[400px] space-y-2">
                    {columnTasks.map(task => {
                      const typeConfig = getTaskTypeConfig(task.task_type);
                      const priorityConfig = getPriorityConfig(task.priority);
                      
                      return (
                        <Card key={task.id} className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {task.task_number}
                            </span>
                            <Badge className={priorityConfig?.color || ''} variant="outline">
                              {task.priority}
                            </Badge>
                          </div>
                          <p className="font-medium text-sm mb-1">{task.task_name}</p>
                          <p className="text-xs text-muted-foreground mb-2">
                            {task.equipment?.equipment_code} - {task.equipment?.equipment_name}
                          </p>
                          <div className="flex items-center justify-between">
                            <Badge className={typeConfig?.color || ''} variant="outline">
                              {task.task_type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(task.due_date), 'MMM d')}
                            </span>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MaintenanceScheduleTab;
