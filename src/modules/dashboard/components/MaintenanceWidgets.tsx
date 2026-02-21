import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useMaintenance } from '@/modules/maintenance/hooks/useMaintenance';
import { format, differenceInDays } from 'date-fns';
import { 
  Wrench, 
  AlertTriangle, 
  Clock, 
  Package, 
  Calendar,
  ArrowRight,
  Settings,
  TrendingUp
} from 'lucide-react';
import { getDefectPriorityConfig, getTaskStatusConfig } from '@/modules/maintenance/constants';

const MaintenanceWidgets: React.FC = () => {
  const navigate = useNavigate();
  const { equipment, tasks, defects, spareParts, stats } = useMaintenance();

  // Get upcoming maintenance tasks (due in next 7 days)
  const upcomingTasks = tasks
    .filter(t => {
      if (t.status === 'Completed' || t.status === 'Cancelled') return false;
      const daysUntilDue = differenceInDays(new Date(t.due_date), new Date());
      return daysUntilDue >= 0 && daysUntilDue <= 7;
    })
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, 5);

  // Get critical defects
  const criticalDefects = defects
    .filter(d => (d.priority === 'P1_Critical' || d.priority === 'P2_Serious') && d.status !== 'Closed')
    .slice(0, 5);

  // Get low stock spare parts
  const lowStockParts = spareParts
    .filter(p => p.quantity_onboard <= p.minimum_stock)
    .slice(0, 5);

  // Equipment health calculation
  const operationalEquipment = equipment.filter(e => e.status === 'Operational').length;
  const equipmentHealthPercent = equipment.length > 0 
    ? Math.round((operationalEquipment / equipment.length) * 100) 
    : 100;

  return (
    <div className="space-y-4">
      {/* Maintenance Overview Card */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Maintenance Overview
          </CardTitle>
          <CardDescription>Equipment & maintenance status summary</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <Settings className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{stats.totalEquipment}</p>
              <p className="text-xs text-muted-foreground">Total Equipment</p>
            </div>
            <div className="text-center p-3 bg-critical-muted rounded-lg">
              <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-critical" />
              <p className="text-2xl font-bold text-critical">{stats.overdueTasks}</p>
              <p className="text-xs text-muted-foreground">Overdue Tasks</p>
            </div>
            <div className="text-center p-3 bg-warning-muted rounded-lg">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-warning" />
              <p className="text-2xl font-bold text-warning">{stats.tasksDueThisWeek}</p>
              <p className="text-xs text-muted-foreground">Due This Week</p>
            </div>
            <div className="text-center p-3 bg-warning-muted rounded-lg">
              <Package className="h-5 w-5 mx-auto mb-1 text-warning" />
              <p className="text-2xl font-bold text-warning">{stats.lowStockParts}</p>
              <p className="text-xs text-muted-foreground">Low Stock Parts</p>
            </div>
          </div>

          {/* Equipment Health */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Equipment Health</span>
              <span className="font-medium">{equipmentHealthPercent}% Operational</span>
            </div>
            <Progress value={equipmentHealthPercent} className="h-2" />
          </div>

          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => navigate('/maintenance')}
          >
            Go to Maintenance
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>

      {/* Critical Defects Alert */}
      {criticalDefects.length > 0 && (
        <Card className="shadow-card border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Critical Defects ({stats.criticalDefects})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {criticalDefects.map(defect => {
                const priorityConfig = getDefectPriorityConfig(defect.priority);
                return (
                  <div 
                    key={defect.id} 
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={priorityConfig?.color || ''}>
                        {priorityConfig?.label || defect.priority}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium truncate max-w-[200px]">
                          {defect.equipment?.equipment_name || 'Unknown Equipment'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {defect.defect_description}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(defect.reported_date), 'MMM d')}
                    </span>
                  </div>
                );
              })}
            </div>
            <Button 
              variant="link" 
              className="p-0 h-auto mt-2"
              onClick={() => navigate('/maintenance')}
            >
              View all defects →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Maintenance */}
      {upcomingTasks.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Upcoming Maintenance
            </CardTitle>
            <CardDescription>Tasks due in the next 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingTasks.map(task => {
                const daysUntilDue = differenceInDays(new Date(task.due_date), new Date());
                const statusConfig = getTaskStatusConfig(task.status);
                return (
                  <div 
                    key={task.id} 
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{task.task_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.equipment?.equipment_name || 'Unknown Equipment'}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge className={statusConfig?.color || ''} variant="outline">
                        {daysUntilDue === 0 ? 'Today' : 
                         daysUntilDue === 1 ? 'Tomorrow' : 
                         `${daysUntilDue} days`}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button 
              variant="link" 
              className="p-0 h-auto mt-2"
              onClick={() => navigate('/maintenance')}
            >
              View full schedule →
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Low Stock Alert */}
      {lowStockParts.length > 0 && (
        <Card className="shadow-card border-warning/50 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-warning">
              <Package className="h-5 w-5" />
              Low Stock Spare Parts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockParts.map(part => (
                <div 
                  key={part.id} 
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{part.part_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{part.part_number}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${part.quantity_onboard === 0 ? 'text-critical' : 'text-warning'}`}>
                      {part.quantity_onboard} / {part.minimum_stock}
                    </p>
                    <p className="text-xs text-muted-foreground">on board / min</p>
                  </div>
                </div>
              ))}
            </div>
            <Button 
              variant="link" 
              className="p-0 h-auto mt-2"
              onClick={() => navigate('/maintenance')}
            >
              Manage spare parts →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MaintenanceWidgets;
