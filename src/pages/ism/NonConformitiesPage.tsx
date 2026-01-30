import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useCorrectiveActions } from '@/hooks/useCorrectiveActions';
import { format, differenceInDays, isPast } from 'date-fns';
import { 
  XCircle, 
  Plus, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Eye,
  FileWarning
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Non-conformities are typically findings from audits that don't comply with standards
// We can derive these from corrective actions with finding_id set, or from audit_findings
const NonConformitiesPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Using corrective actions that have finding_id (NCR related)
  const { data: actions = [], isLoading } = useCorrectiveActions();

  // Filter to show NCR-related items
  const ncrs = actions.filter(a => a.finding_id || a.action_type === 'Corrective');

  const filteredNCRs = ncrs.filter((ncr) => {
    const matchesSearch = searchQuery === '' || 
      ncr.action_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ncr.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || ncr.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Stats
  const openNCRs = ncrs.filter(n => n.status === 'Open').length;
  const inProgressNCRs = ncrs.filter(n => n.status === 'In Progress').length;
  const overdueNCRs = ncrs.filter(n => 
    ['Open', 'In Progress'].includes(n.status) && isPast(new Date(n.due_date))
  ).length;
  const closedThisMonth = ncrs.filter(n => {
    if (n.status !== 'Closed' || !n.completion_date) return false;
    const completionDate = new Date(n.completion_date);
    const now = new Date();
    return completionDate.getMonth() === now.getMonth() && 
           completionDate.getFullYear() === now.getFullYear();
  }).length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'bg-red-500';
      case 'In Progress': return 'bg-yellow-500';
      case 'Verification': return 'bg-purple-500';
      case 'Closed': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'major':
        return <Badge className="bg-red-500 text-white">Major</Badge>;
      case 'minor':
        return <Badge className="bg-yellow-500 text-white">Minor</Badge>;
      case 'observation':
        return <Badge variant="outline">Observation</Badge>;
      default:
        return <Badge variant="secondary">{severity || 'N/A'}</Badge>;
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileWarning className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Non-Conformities</h1>
            </div>
            <p className="text-muted-foreground">
              Track and resolve audit findings and non-conformity reports
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Report NCR
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open NCRs</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", openNCRs > 0 && "text-red-600")}>
                {openNCRs}
              </div>
              <p className="text-xs text-muted-foreground">Requires action</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{inProgressNCRs}</div>
              <p className="text-xs text-muted-foreground">Being addressed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", overdueNCRs > 0 && "text-red-600")}>
                {overdueNCRs}
              </div>
              <p className="text-xs text-muted-foreground">Past due date</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Closed This Month</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{closedThisMonth}</div>
              <p className="text-xs text-muted-foreground">Resolved NCRs</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search non-conformities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="observation">Observation</SelectItem>
                </SelectContent>
              </Select>

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
            </div>
          </CardContent>
        </Card>

        {/* NCR Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading non-conformities...</p>
              </div>
            ) : filteredNCRs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <CheckCircle className="h-12 w-12 text-green-500/50 mb-4" />
                <h3 className="text-lg font-semibold">No non-conformities</h3>
                <p className="text-muted-foreground">
                  Great job! No outstanding NCRs at this time.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NCR #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNCRs.map((ncr) => {
                    const daysInfo = getDaysRemaining(ncr.due_date);
                    return (
                      <TableRow key={ncr.id}>
                        <TableCell className="font-medium">
                          {ncr.action_number}
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">
                          {ncr.description}
                        </TableCell>
                        <TableCell>
                          {ncr.finding_id ? 'Audit Finding' : 'Direct Report'}
                        </TableCell>
                        <TableCell>
                          {ncr.assignee 
                            ? `${ncr.assignee.first_name} ${ncr.assignee.last_name}`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div>{format(new Date(ncr.due_date), 'MMM d, yyyy')}</div>
                            {ncr.status !== 'Closed' && (
                              <div className={cn("text-xs", daysInfo.color)}>
                                {daysInfo.text}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-white", getStatusColor(ncr.status))}>
                            {ncr.status}
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

export default NonConformitiesPage;
