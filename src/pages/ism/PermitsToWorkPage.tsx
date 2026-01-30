import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { 
  Shield, 
  Plus, 
  Search, 
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Flame,
  Zap,
  Wind
} from 'lucide-react';
import { format, isPast, isFuture, addHours } from 'date-fns';
import { cn } from '@/lib/utils';

// Mock data for permits (would come from hook in production)
const mockPermits = [
  {
    id: '1',
    permit_number: 'PTW-2026-001',
    permit_type: 'Hot Work',
    description: 'Welding repairs on deck crane',
    location: 'Main Deck - Crane Base',
    requested_by: 'Chief Officer',
    approved_by: 'Master',
    valid_from: '2026-01-30T08:00:00',
    valid_to: '2026-01-30T16:00:00',
    status: 'Active',
    risk_assessment_id: 'RA-001',
  },
  {
    id: '2',
    permit_number: 'PTW-2026-002',
    permit_type: 'Confined Space Entry',
    description: 'Tank inspection - Ballast Tank 1P',
    location: 'Ballast Tank 1P',
    requested_by: 'Chief Engineer',
    approved_by: 'Master',
    valid_from: '2026-01-29T06:00:00',
    valid_to: '2026-01-29T12:00:00',
    status: 'Closed',
    risk_assessment_id: 'RA-002',
  },
  {
    id: '3',
    permit_number: 'PTW-2026-003',
    permit_type: 'Electrical Work',
    description: 'Switchboard maintenance',
    location: 'Engine Control Room',
    requested_by: 'Electrician',
    approved_by: null,
    valid_from: '2026-01-31T09:00:00',
    valid_to: '2026-01-31T17:00:00',
    status: 'Pending',
    risk_assessment_id: null,
  },
];

const PERMIT_TYPES = [
  { value: 'Hot Work', icon: Flame, color: 'text-orange-500' },
  { value: 'Confined Space Entry', icon: Wind, color: 'text-blue-500' },
  { value: 'Electrical Work', icon: Zap, color: 'text-yellow-500' },
  { value: 'Working at Height', icon: AlertTriangle, color: 'text-red-500' },
  { value: 'Cold Work', icon: Shield, color: 'text-cyan-500' },
];

const PermitsToWorkPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('active');
  
  const permits = mockPermits;
  const isLoading = false;

  // Filter permits based on tab
  const activePermits = permits.filter(p => p.status === 'Active' || p.status === 'Pending');
  const closedPermits = permits.filter(p => p.status === 'Closed' || p.status === 'Expired');

  const currentPermits = activeTab === 'active' ? activePermits : closedPermits;

  const filteredPermits = currentPermits.filter((permit) => {
    const matchesSearch = searchQuery === '' || 
      permit.permit_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      permit.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || permit.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Stats
  const activeCount = permits.filter(p => p.status === 'Active').length;
  const pendingCount = permits.filter(p => p.status === 'Pending').length;
  const closedToday = permits.filter(p => {
    if (p.status !== 'Closed') return false;
    const closedDate = new Date(p.valid_to);
    const today = new Date();
    return closedDate.toDateString() === today.toDateString();
  }).length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return <Badge className="bg-green-500 text-white">Active</Badge>;
      case 'Pending':
        return <Badge className="bg-yellow-500 text-white">Pending Approval</Badge>;
      case 'Closed':
        return <Badge variant="secondary">Closed</Badge>;
      case 'Expired':
        return <Badge className="bg-red-500 text-white">Expired</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPermitTypeIcon = (type: string) => {
    const permitType = PERMIT_TYPES.find(pt => pt.value === type);
    if (!permitType) return <Shield className="h-4 w-4" />;
    const Icon = permitType.icon;
    return <Icon className={cn("h-4 w-4", permitType.color)} />;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Permits to Work</h1>
            </div>
            <p className="text-muted-foreground">
              Manage work permits for hazardous operations
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Permit
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Permits</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
              <p className="text-xs text-muted-foreground">Currently valid</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", pendingCount > 0 && "text-yellow-600")}>
                {pendingCount}
              </div>
              <p className="text-xs text-muted-foreground">Awaiting authorization</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Closed Today</CardTitle>
              <XCircle className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{closedToday}</div>
              <p className="text-xs text-muted-foreground">Completed permits</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total This Week</CardTitle>
              <Shield className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{permits.length}</div>
              <p className="text-xs text-muted-foreground">All permits</p>
            </CardContent>
          </Card>
        </div>

        {/* Permit Types Quick Access */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {PERMIT_TYPES.map((type) => {
            const Icon = type.icon;
            return (
              <Card key={type.value} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="pt-6 text-center">
                  <Icon className={cn("h-8 w-8 mx-auto mb-2", type.color)} />
                  <p className="text-sm font-medium">{type.value}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="active">Active & Pending</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search permits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value="active" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">Loading permits...</p>
                  </div>
                ) : filteredPermits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">No active permits</h3>
                    <p className="text-muted-foreground mb-4">
                      Create a permit to work for hazardous operations
                    </p>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      New Permit
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Permit #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Valid Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPermits.map((permit) => (
                        <TableRow key={permit.id}>
                          <TableCell className="font-medium">
                            {permit.permit_number}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getPermitTypeIcon(permit.permit_type)}
                              <span>{permit.permit_type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {permit.description}
                          </TableCell>
                          <TableCell>{permit.location}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{format(new Date(permit.valid_from), 'MMM d, HH:mm')}</div>
                              <div className="text-muted-foreground">
                                to {format(new Date(permit.valid_to), 'HH:mm')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(permit.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="closed" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {filteredPermits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <CheckCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">No closed permits</h3>
                    <p className="text-muted-foreground">
                      Completed permits will appear here
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Permit #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Valid Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPermits.map((permit) => (
                        <TableRow key={permit.id}>
                          <TableCell className="font-medium">
                            {permit.permit_number}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getPermitTypeIcon(permit.permit_type)}
                              <span>{permit.permit_type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {permit.description}
                          </TableCell>
                          <TableCell>{permit.location}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{format(new Date(permit.valid_from), 'MMM d, HH:mm')}</div>
                              <div className="text-muted-foreground">
                                to {format(new Date(permit.valid_to), 'HH:mm')}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(permit.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PermitsToWorkPage;
