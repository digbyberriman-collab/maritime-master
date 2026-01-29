import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  ClipboardCheck, Plus, User, Calendar, Flag, CheckCircle, 
  Clock, AlertTriangle, Filter, ChevronDown, MoreHorizontal,
  Play, XCircle, CheckSquare, Ship, Loader2
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCrewTasks, CrewTask, TaskStatus } from '@/hooks/useCrewTasks';
import { AssignTaskModal } from '@/components/crew/AssignTaskModal';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow, isPast } from 'date-fns';

export default function CrewTasksPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'my-tasks' | 'assigned-by-me'>('my-tasks');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [completeTaskId, setCompleteTaskId] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');

  const { 
    tasks: myTasks, 
    loading: loadingMyTasks, 
    updateTaskStatus, 
    verifyTask,
    deleteTask,
    refresh: refreshMyTasks 
  } = useCrewTasks({ 
    assignedToMe: true,
    status: ['pending', 'in_progress', 'overdue'] 
  });

  const { 
    tasks: assignedTasks, 
    loading: loadingAssigned,
    refresh: refreshAssigned 
  } = useCrewTasks({ 
    assignedByMe: true 
  });

  const displayTasks = activeTab === 'my-tasks' ? myTasks : assignedTasks;
  const loading = activeTab === 'my-tasks' ? loadingMyTasks : loadingAssigned;

  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return displayTasks;
    const query = searchQuery.toLowerCase();
    return displayTasks.filter(task => 
      task.title.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query)
    );
  }, [displayTasks, searchQuery]);

  const taskCounts = useMemo(() => ({
    pending: myTasks.filter(t => t.status === 'pending').length,
    inProgress: myTasks.filter(t => t.status === 'in_progress').length,
    overdue: myTasks.filter(t => 
      t.status !== 'completed' && t.due_date && isPast(new Date(t.due_date))
    ).length,
    awaitingVerification: assignedTasks.filter(t => 
      t.status === 'completed' && t.verification_required && !t.verified_at
    ).length,
  }), [myTasks, assignedTasks]);

  function handleStartTask(taskId: string) {
    updateTaskStatus(taskId, 'in_progress');
  }

  function handleCompleteTask() {
    if (!completeTaskId) return;
    updateTaskStatus(completeTaskId, 'completed', completionNotes);
    setCompleteTaskId(null);
    setCompletionNotes('');
  }

  function handleVerifyTask(taskId: string) {
    verifyTask(taskId);
  }

  function handleRefresh() {
    refreshMyTasks();
    refreshAssigned();
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6" />
              Crew Tasks
            </h1>
            <p className="text-muted-foreground">
              Manage assigned tasks, reviews, and evaluations
            </p>
          </div>
          <Button onClick={() => setShowAssignModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Assign Task
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            label="Pending" 
            value={taskCounts.pending} 
            icon={Clock} 
            color="text-blue-600 bg-blue-100" 
          />
          <StatCard 
            label="In Progress" 
            value={taskCounts.inProgress} 
            icon={Play} 
            color="text-yellow-600 bg-yellow-100" 
          />
          <StatCard 
            label="Overdue" 
            value={taskCounts.overdue} 
            icon={AlertTriangle} 
            color="text-destructive bg-destructive/10" 
            alert={taskCounts.overdue > 0}
          />
          <StatCard 
            label="Awaiting Verification" 
            value={taskCounts.awaitingVerification} 
            icon={CheckSquare} 
            color="text-purple-600 bg-purple-100" 
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList>
              <TabsTrigger value="my-tasks">
                My Tasks
                {myTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{myTasks.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="assigned-by-me">
                Assigned by Me
                {assignedTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-2">{assignedTasks.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>

          <TabsContent value="my-tasks" className="mt-4">
            <TaskList 
              tasks={filteredTasks} 
              loading={loading}
              viewMode="assignee"
              onStart={handleStartTask}
              onComplete={(id) => setCompleteTaskId(id)}
              onDelete={deleteTask}
            />
          </TabsContent>

          <TabsContent value="assigned-by-me" className="mt-4">
            <TaskList 
              tasks={filteredTasks} 
              loading={loading}
              viewMode="assigner"
              onVerify={handleVerifyTask}
              onDelete={deleteTask}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Assign Task Modal */}
      <AssignTaskModal 
        open={showAssignModal} 
        onOpenChange={setShowAssignModal}
        onSuccess={handleRefresh}
      />

      {/* Complete Task Dialog */}
      <Dialog open={!!completeTaskId} onOpenChange={() => setCompleteTaskId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Completion Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Add any notes about the completed task..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTaskId(null)}>
              Cancel
            </Button>
            <Button onClick={handleCompleteTask}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  color,
  alert 
}: { 
  label: string; 
  value: number; 
  icon: React.ElementType;
  color: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? 'border-destructive' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskList({ 
  tasks, 
  loading,
  viewMode,
  onStart,
  onComplete,
  onVerify,
  onDelete,
}: { 
  tasks: CrewTask[];
  loading: boolean;
  viewMode: 'assignee' | 'assigner';
  onStart?: (id: string) => void;
  onComplete?: (id: string) => void;
  onVerify?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
          <h3 className="font-medium">No tasks</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {viewMode === 'assignee' 
              ? "You're all caught up! No pending tasks."
              : "You haven't assigned any tasks yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          viewMode={viewMode}
          onStart={onStart}
          onComplete={onComplete}
          onVerify={onVerify}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function TaskCard({ 
  task, 
  viewMode,
  onStart,
  onComplete,
  onVerify,
  onDelete,
}: { 
  task: CrewTask;
  viewMode: 'assignee' | 'assigner';
  onStart?: (id: string) => void;
  onComplete?: (id: string) => void;
  onVerify?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'completed';
  const needsVerification = task.status === 'completed' && task.verification_required && !task.verified_at;

  const priorityColors: Record<string, string> = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-destructive/10 text-destructive',
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    overdue: 'bg-destructive/10 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  };

  const typeLabels: Record<string, string> = {
    task: 'Task',
    review: 'Review',
    evaluation: 'Evaluation',
    form: 'Form',
    acknowledgement: 'Acknowledgement',
    other: 'Other',
  };

  return (
    <Card className={isOverdue ? 'border-destructive' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h3 className="font-medium">{task.title}</h3>
              <Badge variant="outline" className={priorityColors[task.priority]}>
                {task.priority}
              </Badge>
              <Badge variant="outline">{typeLabels[task.task_type]}</Badge>
              <Badge className={statusColors[isOverdue ? 'overdue' : task.status]}>
                {isOverdue ? 'Overdue' : task.status.replace('_', ' ')}
              </Badge>
              {needsVerification && (
                <Badge variant="outline" className="bg-purple-100 text-purple-800">
                  Awaiting Verification
                </Badge>
              )}
            </div>

            {task.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {viewMode === 'assigner' && task.assigned_to_profile && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {task.assigned_to_profile.first_name} {task.assigned_to_profile.last_name}
                </span>
              )}
              {viewMode === 'assignee' && task.assigned_by_profile && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  From: {task.assigned_by_profile.first_name} {task.assigned_by_profile.last_name}
                </span>
              )}
              {task.vessel?.name && (
                <span className="flex items-center gap-1">
                  <Ship className="h-3 w-3" />
                  {task.vessel.name}
                </span>
              )}
              {task.due_date && (
                <span className={`flex items-center gap-1 ${isOverdue ? 'text-destructive' : ''}`}>
                  <Calendar className="h-3 w-3" />
                  Due {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
                </span>
              )}
            </div>

            {task.completed_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Completed {format(new Date(task.completed_at), 'MMM d, yyyy')}
                {task.completion_notes && `: ${task.completion_notes}`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {viewMode === 'assignee' && task.status === 'pending' && (
              <Button size="sm" variant="outline" onClick={() => onStart?.(task.id)}>
                <Play className="h-4 w-4 mr-1" />
                Start
              </Button>
            )}
            {viewMode === 'assignee' && task.status === 'in_progress' && (
              <Button size="sm" onClick={() => onComplete?.(task.id)}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Complete
              </Button>
            )}
            {viewMode === 'assigner' && needsVerification && (
              <Button size="sm" onClick={() => onVerify?.(task.id)}>
                <CheckSquare className="h-4 w-4 mr-1" />
                Verify
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>View Details</DropdownMenuItem>
                {viewMode === 'assigner' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={() => onDelete?.(task.id)}
                    >
                      Delete Task
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
