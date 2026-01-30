import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  AlertTriangle, 
  Search, 
  Plus, 
  MoreHorizontal, 
  Edit, 
  CheckCircle,
  Clock,
  XCircle,
  Ship,
  Wrench,
  Calendar,
  User,
  Flag,
  Eye,
  FileText
} from 'lucide-react';

interface MaintenanceDefect {
  id: string;
  defect_number: string;
  vessel: string;
  equipment: string;
  location: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'pending_parts' | 'completed' | 'cancelled';
  ism_critical: boolean;
  reported_date: string;
  reported_by: string;
  assigned_to?: string;
  target_completion: string;
  completion_date?: string;
  estimated_cost?: number;
  actual_cost?: number;
  spare_parts_required?: string[];
  created_at: string;
  updated_at: string;
}

// Mock data for demo purposes
const mockDefects: MaintenanceDefect[] = [
  {
    id: '1',
    defect_number: 'DEF-2024-0001',
    vessel: 'MV Atlantic Pioneer',
    equipment: 'Main Engine',
    location: 'Engine Room',
    description: 'Oil leak detected from main engine cylinder head gasket. Requires immediate attention to prevent further damage.',
    priority: 'critical',
    status: 'in_progress',
    ism_critical: true,
    reported_date: '2024-01-25T08:30:00Z',
    reported_by: 'Chief Engineer Mike Rodriguez',
    assigned_to: 'Second Engineer Robert Chen',
    target_completion: '2024-02-05T00:00:00Z',
    estimated_cost: 3500,
    spare_parts_required: ['Cylinder Head Gasket', 'Engine Oil', 'Sealing Compound'],
    created_at: '2024-01-25T08:30:00Z',
    updated_at: '2024-01-29T14:20:00Z'
  },
  {
    id: '2',
    defect_number: 'DEF-2024-0002',
    vessel: 'MV Ocean Explorer',
    equipment: 'Fire Pump',
    location: 'Engine Room',
    description: 'Fire pump not maintaining required pressure during weekly test. Impeller may need replacement.',
    priority: 'high',
    status: 'pending_parts',
    ism_critical: true,
    reported_date: '2024-01-28T10:15:00Z',
    reported_by: 'Third Engineer David Wilson',
    assigned_to: 'Chief Engineer Elena Rossi',
    target_completion: '2024-02-10T00:00:00Z',
    estimated_cost: 1200,
    spare_parts_required: ['Fire Pump Impeller', 'Pump Seal Kit'],
    created_at: '2024-01-28T10:15:00Z',
    updated_at: '2024-01-30T09:45:00Z'
  },
  {
    id: '3',
    defect_number: 'DEF-2024-0003',
    vessel: 'MV Pacific Voyager',
    equipment: 'Navigation Radar',
    location: 'Bridge',
    description: 'Radar display showing intermittent signal loss in sectors 090-180 degrees. Affects navigation safety.',
    priority: 'high',
    status: 'open',
    ism_critical: true,
    reported_date: '2024-01-29T16:45:00Z',
    reported_by: 'Second Officer Lisa Brown',
    target_completion: '2024-02-08T00:00:00Z',
    estimated_cost: 2800,
    spare_parts_required: ['Radar Antenna Assembly', 'Signal Processor Unit'],
    created_at: '2024-01-29T16:45:00Z',
    updated_at: '2024-01-29T16:45:00Z'
  },
  {
    id: '4',
    defect_number: 'DEF-2024-0004',
    vessel: 'MV North Star',
    equipment: 'Deck Crane',
    location: 'Main Deck',
    description: 'Hydraulic cylinder seal leaking on port side deck crane. Crane operation restricted until repair.',
    priority: 'medium',
    status: 'completed',
    ism_critical: false,
    reported_date: '2024-01-20T12:00:00Z',
    reported_by: 'Bosun Maria Garcia',
    assigned_to: 'Electrician Carlos Lopez',
    target_completion: '2024-01-30T00:00:00Z',
    completion_date: '2024-01-28T14:30:00Z',
    estimated_cost: 800,
    actual_cost: 750,
    spare_parts_required: ['Hydraulic Seal Kit', 'Hydraulic Oil'],
    created_at: '2024-01-20T12:00:00Z',
    updated_at: '2024-01-28T14:30:00Z'
  },
  {
    id: '5',
    defect_number: 'DEF-2024-0005',
    vessel: 'MV Eastern Dawn',
    equipment: 'Generator No. 2',
    location: 'Engine Room',
    description: 'Auxiliary generator showing high exhaust temperature readings. Cooling system inspection required.',
    priority: 'medium',
    status: 'in_progress',
    ism_critical: false,
    reported_date: '2024-01-26T14:20:00Z',
    reported_by: 'Oiler Tom Jackson',
    assigned_to: 'Third Engineer Anna Martinez',
    target_completion: '2024-02-12T00:00:00Z',
    estimated_cost: 1500,
    spare_parts_required: ['Cooling System Parts', 'Thermostat'],
    created_at: '2024-01-26T14:20:00Z',
    updated_at: '2024-01-30T11:15:00Z'
  },
  {
    id: '6',
    defect_number: 'DEF-2024-0006',
    vessel: 'MV Iron Duke',
    equipment: 'Steering Gear',
    location: 'Steering Gear Room',
    description: 'Steering gear hydraulic pump making unusual noise during operation. Preventive maintenance due.',
    priority: 'low',
    status: 'open',
    ism_critical: false,
    reported_date: '2024-01-30T08:00:00Z',
    reported_by: 'AB Seaman James Taylor',
    target_completion: '2024-02-20T00:00:00Z',
    estimated_cost: 600,
    spare_parts_required: ['Hydraulic Pump Bearing', 'Filter Element'],
    created_at: '2024-01-30T08:00:00Z',
    updated_at: '2024-01-30T08:00:00Z'
  }
];

const MaintenanceDefects: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const priorityLabels: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };

  const statusLabels: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    pending_parts: 'Pending Parts',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  const getPriorityBadge = (priority: string, ismCritical: boolean) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-800 border-gray-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      critical: 'bg-red-100 text-red-800 border-red-200',
    };

    return (
      <div className="flex items-center gap-2">
        <Badge className={colors[priority] || 'bg-gray-100 text-gray-800 border-gray-200'}>
          {priorityLabels[priority] || priority}
        </Badge>
        {ismCritical && (
          <Badge className="bg-red-500 text-white border-red-500">
            <Flag className="w-3 h-3 mr-1" />
            ISM Critical
          </Badge>
        )}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-blue-100 text-blue-800 border-blue-200',
      in_progress: 'bg-purple-100 text-purple-800 border-purple-200',
      pending_parts: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {statusLabels[status] || status}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 text-purple-500" />;
      case 'pending_parts':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-blue-500" />;
    }
  };

  const isOverdue = (targetDate: string, status: string) => {
    if (status === 'completed' || status === 'cancelled') return false;
    return new Date(targetDate) < new Date();
  };

  const filteredDefects = useMemo(() => {
    let filtered = mockDefects;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (defect) =>
          defect.defect_number.toLowerCase().includes(query) ||
          defect.vessel.toLowerCase().includes(query) ||
          defect.equipment.toLowerCase().includes(query) ||
          defect.description.toLowerCase().includes(query) ||
          defect.location.toLowerCase().includes(query)
      );
    }

    // Filter by priority
    if (selectedPriority !== 'all') {
      filtered = filtered.filter((defect) => defect.priority === selectedPriority);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((defect) => defect.status === selectedStatus);
    }

    return filtered;
  }, [mockDefects, searchQuery, selectedPriority, selectedStatus]);

  const stats = [
    {
      title: 'Open Defects',
      value: mockDefects.filter(d => d.status !== 'completed' && d.status !== 'cancelled').length,
      description: 'Require attention',
      icon: AlertTriangle,
    },
    {
      title: 'ISM Critical',
      value: mockDefects.filter(d => d.ism_critical && d.status !== 'completed').length,
      description: 'High priority items',
      icon: Flag,
    },
    {
      title: 'Overdue',
      value: mockDefects.filter(d => isOverdue(d.target_completion, d.status)).length,
      description: 'Past target date',
      icon: XCircle,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Maintenance Defects</h1>
            <p className="text-muted-foreground">
              Track and manage open defects across your fleet
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Report Defect
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.title} className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="w-5 h-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search defects by number, vessel, equipment, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedPriority === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedPriority('all')}
                  size="sm"
                >
                  All Priority
                </Button>
                <Button
                  variant={selectedPriority === 'critical' ? 'default' : 'outline'}
                  onClick={() => setSelectedPriority('critical')}
                  size="sm"
                >
                  Critical
                </Button>
                <Button
                  variant={selectedPriority === 'high' ? 'default' : 'outline'}
                  onClick={() => setSelectedPriority('high')}
                  size="sm"
                >
                  High
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedStatus === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('all')}
                  size="sm"
                >
                  All Status
                </Button>
                <Button
                  variant={selectedStatus === 'open' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('open')}
                  size="sm"
                >
                  Open
                </Button>
                <Button
                  variant={selectedStatus === 'in_progress' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('in_progress')}
                  size="sm"
                >
                  In Progress
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Defects Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Open Defects ({filteredDefects.length})</CardTitle>
            <CardDescription>
              Maintenance defects requiring attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Defect</TableHead>
                  <TableHead>Vessel & Equipment</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Target Date</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDefects.map((defect) => (
                  <TableRow key={defect.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-muted-foreground" />
                          {defect.defect_number}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {defect.description}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Location: {defect.location}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <Ship className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{defect.vessel}</span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {defect.equipment}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getPriorityBadge(defect.priority, defect.ism_critical)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(defect.status)}
                        {getStatusBadge(defect.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={`text-sm ${isOverdue(defect.target_completion, defect.status) ? 'text-red-600' : ''}`}>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(defect.target_completion).toLocaleDateString()}
                          {isOverdue(defect.target_completion, defect.status) && (
                            <AlertTriangle className="w-3 h-3 text-red-500 ml-1" />
                          )}
                        </div>
                        {defect.completion_date && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Completed: {new Date(defect.completion_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {defect.assigned_to ? (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{defect.assigned_to}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem className="gap-2">
                            <Eye className="h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Edit className="h-4 w-4" />
                            Update Defect
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <User className="h-4 w-4" />
                            Assign Engineer
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <FileText className="h-4 w-4" />
                            Work Order
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2">
                            <CheckCircle className="h-4 w-4" />
                            Mark Complete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredDefects.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No defects found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MaintenanceDefects;