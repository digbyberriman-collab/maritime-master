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
import { useIncidents } from '@/hooks/useIncidents';
import { format } from 'date-fns';
import { 
  Search as SearchIcon, 
  FileSearch, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Eye,
  PlayCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIncidentTypeColor } from '@/lib/incidentConstants';

const InvestigationsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Get all incidents that require investigation
  const { data: incidents = [], isLoading } = useIncidents({});

  // Filter to only show incidents requiring investigation
  const investigatableIncidents = incidents.filter(
    (incident) => incident.investigation_required
  );

  // Apply additional filters
  const filteredIncidents = investigatableIncidents.filter((incident) => {
    const matchesSearch = searchQuery === '' || 
      incident.incident_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      incident.investigation_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const notStarted = investigatableIncidents.filter(
    i => i.investigation_status === 'Not Started'
  ).length;
  const inProgress = investigatableIncidents.filter(
    i => i.investigation_status === 'In Progress'
  ).length;
  const completed = investigatableIncidents.filter(
    i => i.investigation_status === 'Completed'
  ).length;

  const getInvestigationStatusColor = (status: string) => {
    switch (status) {
      case 'Not Started': return 'bg-gray-500';
      case 'In Progress': return 'bg-yellow-500';
      case 'Completed': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileSearch className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Investigations</h1>
            </div>
            <p className="text-muted-foreground">
              Root cause analysis and incident investigations
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Awaiting Investigation</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", notStarted > 0 && "text-red-600")}>
                {notStarted}
              </div>
              <p className="text-xs text-muted-foreground">Not yet started</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{inProgress}</div>
              <p className="text-xs text-muted-foreground">Currently investigating</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completed}</div>
              <p className="text-xs text-muted-foreground">Investigations closed</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search investigations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Investigation Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Not Started">Not Started</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Investigations Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading investigations...</p>
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <FileSearch className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No investigations found</h3>
                <p className="text-muted-foreground">
                  All incidents with required investigations will appear here
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incident #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Investigation Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIncidents.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell className="font-medium">
                        {incident.incident_number}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-white", getIncidentTypeColor(incident.incident_type))}>
                          {incident.incident_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(incident.incident_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate">
                        {incident.description}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "font-medium",
                          incident.severity_actual >= 4 ? "text-red-600" :
                          incident.severity_actual >= 3 ? "text-orange-600" :
                          "text-yellow-600"
                        )}>
                          {incident.severity_actual}/5
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-white", getInvestigationStatusColor(incident.investigation_status))}>
                          {incident.investigation_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {incident.investigation_status === 'Not Started' && (
                            <Button variant="ghost" size="sm" title="Start Investigation">
                              <PlayCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" title="View Details">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default InvestigationsPage;
