import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCorrectiveActions } from '@/modules/incidents/hooks/useCorrectiveActions';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import { format, differenceInDays, isPast } from 'date-fns';
import {
  ClipboardCheck,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CorrectiveActionsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  const { data: actions = [], isLoading } = useCorrectiveActions();

  // Filter actions
  const filteredActions = actions.filter((action) => {
    const matchesSearch = searchQuery === '' || 
      action.action_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || action.status === statusFilter;
    const matchesType = typeFilter === 'all' || action.action_type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  // Calculate stats
  const openActions = actions.filter(a => a.status === 'Open').length;
  const inProgressActions = actions.filter(a => a.status === 'In Progress').length;
  const overdueActions = actions.filter(a => 
    ['Open', 'In Progress'].includes(a.status) && isPast(new Date(a.due_date))
  ).length;
  const closedThisMonth = actions.filter(a => {
    if (a.status !== 'Closed' || !a.completion_date) return false;
    const completionDate = new Date(a.completion_date);
    const now = new Date();
    return completionDate.getMonth() === now.getMonth() && 
           completionDate.getFullYear() === now.getFullYear();
  }).length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'bg-blue-500';
      case 'In Progress': return 'bg-yellow-500';
      case 'Verification': return 'bg-purple-500';
      case 'Closed': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Immediate': return 'bg-red-500';
      case 'Corrective': return 'bg-orange-500';
      case 'Preventive': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getDaysRemaining = (dueDate: string) => {
    const days = differenceInDays(new Date(dueDate), new Date());
    if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: 'text-red-600' };
    if (days === 0) return { text: 'Due today', color: 'text-orange-600' };
    if (days <= 7) return { text: `${days}d remaining`, color: 'text-yellow-600' };
    return { text: `${days}d remaining`, color: 'text-muted-foreground' };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={<ClipboardCheck className="w-6 h-6" />}
          title="Corrective Actions (CAPA)"
          description="Track and manage corrective, preventive, and immediate actions"
          actions={
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Action
            </Button>
          }
        />

        <StatGrid cols={4}>
          <StatCard
            label="Open Actions"
            value={openActions}
            icon={<AlertTriangle className="w-4 h-4 text-blue-500" />}
            hint="Awaiting action"
          />
          <StatCard
            label="In Progress"
            value={inProgressActions}
            icon={<Clock className="w-4 h-4 text-yellow-500" />}
            hint="Being worked on"
          />
          <StatCard
            label="Overdue"
            value={overdueActions}
            icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
            tone={overdueActions > 0 ? 'danger' : 'default'}
            hint="Past due date"
          />
          <StatCard
            label="Closed This Month"
            value={closedThisMonth}
            icon={<CheckCircle className="w-4 h-4 text-green-500" />}
            tone="success"
            hint="Completed actions"
          />
        </StatGrid>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search actions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Verification">Verification</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="Immediate">Immediate</SelectItem>
                  <SelectItem value="Corrective">Corrective</SelectItem>
                  <SelectItem value="Preventive">Preventive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Actions Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading actions...</p>
              </div>
            ) : filteredActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <ClipboardCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No corrective actions found</h3>
                <p className="text-muted-foreground">
                  Create a new action or adjust your filters
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActions.map((action) => {
                    const daysInfo = getDaysRemaining(action.due_date);
                    return (
                      <TableRow key={action.id}>
                        <TableCell className="font-medium">
                          {action.action_number}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-white", getTypeColor(action.action_type))}>
                            {action.action_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">
                          {action.description}
                        </TableCell>
                        <TableCell>
                          {action.assignee 
                            ? `${action.assignee.first_name} ${action.assignee.last_name}`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div>{format(new Date(action.due_date), 'MMM d, yyyy')}</div>
                            {action.status !== 'Closed' && (
                              <div className={cn("text-xs", daysInfo.color)}>
                                {daysInfo.text}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-white", getStatusColor(action.status))}>
                            {action.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CorrectiveActionsPage;
