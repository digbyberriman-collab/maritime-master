import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Shield, 
  Search, 
  Plus, 
  MoreHorizontal, 
  Edit, 
  Eye,
  CheckCircle,
  AlertTriangle,
  Clock,
  Ship,
  Wrench,
  Calendar,
  User,
  Package,
  FileText,
  TestTube,
  Activity
} from 'lucide-react';

interface CriticalEquipment {
  id: string;
  equipment_name: string;
  equipment_code: string;
  vessel: string;
  location: string;
  system: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  installation_date: string;
  ism_critical: boolean;
  backup_available: boolean;
  maintenance_status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  last_maintenance: string;
  next_maintenance: string;
  maintenance_interval: number; // days
  responsible_officer: string;
  spare_parts_status: 'adequate' | 'low' | 'critical' | 'none';
  spare_parts_count: number;
  test_frequency: string;
  last_test: string;
  next_test: string;
  test_status: 'passed' | 'failed' | 'overdue' | 'pending';
  condition_monitoring: boolean;
  created_at: string;
  updated_at: string;
}

// Mock data for demo purposes
const mockCriticalEquipment: CriticalEquipment[] = [
  {
    id: '1',
    equipment_name: 'Main Engine',
    equipment_code: 'ME-001',
    vessel: 'MV Atlantic Pioneer',
    location: 'Engine Room',
    system: 'Propulsion',
    manufacturer: 'MAN B&W',
    model: '6S50MC-C',
    serial_number: 'ME-2023-001',
    installation_date: '2023-03-15T00:00:00Z',
    ism_critical: true,
    backup_available: false,
    maintenance_status: 'good',
    last_maintenance: '2024-01-15T00:00:00Z',
    next_maintenance: '2024-04-15T00:00:00Z',
    maintenance_interval: 90,
    responsible_officer: 'Chief Engineer Mike Rodriguez',
    spare_parts_status: 'adequate',
    spare_parts_count: 45,
    test_frequency: 'Daily',
    last_test: '2024-01-30T08:00:00Z',
    next_test: '2024-01-31T08:00:00Z',
    test_status: 'passed',
    condition_monitoring: true,
    created_at: '2023-03-15T00:00:00Z',
    updated_at: '2024-01-30T08:00:00Z'
  },
  {
    id: '2',
    equipment_name: 'Emergency Fire Pump',
    equipment_code: 'FP-EMG-001',
    vessel: 'MV Atlantic Pioneer',
    location: 'Engine Room',
    system: 'Fire Fighting',
    manufacturer: 'Grundfos',
    model: 'NB 125-250/240',
    serial_number: 'FP-2023-005',
    installation_date: '2023-03-20T00:00:00Z',
    ism_critical: true,
    backup_available: true,
    maintenance_status: 'excellent',
    last_maintenance: '2024-01-20T00:00:00Z',
    next_maintenance: '2024-07-20T00:00:00Z',
    maintenance_interval: 180,
    responsible_officer: 'Second Engineer Robert Chen',
    spare_parts_status: 'good',
    spare_parts_count: 12,
    test_frequency: 'Weekly',
    last_test: '2024-01-29T10:00:00Z',
    next_test: '2024-02-05T10:00:00Z',
    test_status: 'passed',
    condition_monitoring: true,
    created_at: '2023-03-20T00:00:00Z',
    updated_at: '2024-01-29T10:00:00Z'
  },
  {
    id: '3',
    equipment_name: 'Steering Gear Motor',
    equipment_code: 'SG-MOT-001',
    vessel: 'MV Ocean Explorer',
    location: 'Steering Gear Room',
    system: 'Navigation',
    manufacturer: 'Rolls-Royce',
    model: 'Aquamaster US 255',
    serial_number: 'SG-2023-008',
    installation_date: '2023-05-10T00:00:00Z',
    ism_critical: true,
    backup_available: true,
    maintenance_status: 'fair',
    last_maintenance: '2023-11-10T00:00:00Z',
    next_maintenance: '2024-02-10T00:00:00Z',
    maintenance_interval: 90,
    responsible_officer: 'Chief Engineer Elena Rossi',
    spare_parts_status: 'low',
    spare_parts_count: 3,
    test_frequency: 'Daily',
    last_test: '2024-01-30T06:00:00Z',
    next_test: '2024-01-31T06:00:00Z',
    test_status: 'passed',
    condition_monitoring: false,
    created_at: '2023-05-10T00:00:00Z',
    updated_at: '2024-01-30T06:00:00Z'
  },
  {
    id: '4',
    equipment_name: 'Main Generator No. 1',
    equipment_code: 'GEN-001',
    vessel: 'MV Pacific Voyager',
    location: 'Engine Room',
    system: 'Electrical',
    manufacturer: 'Caterpillar',
    model: '3516B',
    serial_number: 'GEN-2023-012',
    installation_date: '2023-04-25T00:00:00Z',
    ism_critical: true,
    backup_available: true,
    maintenance_status: 'critical',
    last_maintenance: '2023-10-25T00:00:00Z',
    next_maintenance: '2024-01-25T00:00:00Z',
    maintenance_interval: 90,
    responsible_officer: 'Third Engineer David Wilson',
    spare_parts_status: 'critical',
    spare_parts_count: 1,
    test_frequency: 'Weekly',
    last_test: '2024-01-22T14:00:00Z',
    next_test: '2024-01-29T14:00:00Z',
    test_status: 'overdue',
    condition_monitoring: true,
    created_at: '2023-04-25T00:00:00Z',
    updated_at: '2024-01-22T14:00:00Z'
  },
  {
    id: '5',
    equipment_name: 'Life Boat Davit System',
    equipment_code: 'LB-DAV-001',
    vessel: 'MV North Star',
    location: 'Boat Deck',
    system: 'Life Saving',
    manufacturer: 'Schat-Harding',
    model: 'SH-150',
    serial_number: 'LB-2023-020',
    installation_date: '2023-06-05T00:00:00Z',
    ism_critical: true,
    backup_available: false,
    maintenance_status: 'good',
    last_maintenance: '2024-01-05T00:00:00Z',
    next_maintenance: '2024-04-05T00:00:00Z',
    maintenance_interval: 90,
    responsible_officer: 'Bosun Maria Garcia',
    spare_parts_status: 'adequate',
    spare_parts_count: 8,
    test_frequency: 'Monthly',
    last_test: '2024-01-15T10:00:00Z',
    next_test: '2024-02-15T10:00:00Z',
    test_status: 'passed',
    condition_monitoring: false,
    created_at: '2023-06-05T00:00:00Z',
    updated_at: '2024-01-15T10:00:00Z'
  },
  {
    id: '6',
    equipment_name: 'Cargo Hold Ventilation Fan',
    equipment_code: 'VF-CH-001',
    vessel: 'MV Eastern Dawn',
    location: 'Cargo Hold No. 1',
    system: 'Ventilation',
    manufacturer: 'Howden',
    model: 'HV-2500',
    serial_number: 'VF-2023-033',
    installation_date: '2023-07-12T00:00:00Z',
    ism_critical: false,
    backup_available: true,
    maintenance_status: 'poor',
    last_maintenance: '2023-10-12T00:00:00Z',
    next_maintenance: '2024-01-12T00:00:00Z',
    maintenance_interval: 90,
    responsible_officer: 'Electrician Carlos Lopez',
    spare_parts_status: 'none',
    spare_parts_count: 0,
    test_frequency: 'Weekly',
    last_test: '2024-01-08T12:00:00Z',
    next_test: '2024-01-15T12:00:00Z',
    test_status: 'failed',
    condition_monitoring: false,
    created_at: '2023-07-12T00:00:00Z',
    updated_at: '2024-01-08T12:00:00Z'
  }
];

const CriticalEquipment: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSystem, setSelectedSystem] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const systemTypes = [...new Set(mockCriticalEquipment.map(eq => eq.system))];
  
  const statusLabels: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
    critical: 'Critical',
  };

  const getMaintenanceStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      excellent: 'bg-green-100 text-green-800 border-green-200',
      good: 'bg-blue-100 text-blue-800 border-blue-200',
      fair: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      poor: 'bg-orange-100 text-orange-800 border-orange-200',
      critical: 'bg-red-100 text-red-800 border-red-200',
    };

    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {statusLabels[status] || status}
      </Badge>
    );
  };

  const getSparePartsStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      adequate: 'bg-green-100 text-green-800 border-green-200',
      good: 'bg-blue-100 text-blue-800 border-blue-200',
      low: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      critical: 'bg-red-100 text-red-800 border-red-200',
      none: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getTestStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'overdue':
        return <Clock className="w-4 h-4 text-orange-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-blue-500" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const isMaintenanceOverdue = (nextMaintenance: string) => {
    return new Date(nextMaintenance) < new Date();
  };

  const isTestOverdue = (nextTest: string) => {
    return new Date(nextTest) < new Date();
  };

  const filteredEquipment = useMemo(() => {
    let filtered = mockCriticalEquipment;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (equipment) =>
          equipment.equipment_name.toLowerCase().includes(query) ||
          equipment.equipment_code.toLowerCase().includes(query) ||
          equipment.vessel.toLowerCase().includes(query) ||
          equipment.system.toLowerCase().includes(query) ||
          equipment.manufacturer.toLowerCase().includes(query)
      );
    }

    // Filter by system
    if (selectedSystem !== 'all') {
      filtered = filtered.filter((equipment) => equipment.system === selectedSystem);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((equipment) => equipment.maintenance_status === selectedStatus);
    }

    return filtered;
  }, [mockCriticalEquipment, searchQuery, selectedSystem, selectedStatus]);

  const stats = [
    {
      title: 'ISM Critical Equipment',
      value: mockCriticalEquipment.filter(e => e.ism_critical).length,
      description: 'Safety critical items',
      icon: Shield,
    },
    {
      title: 'Overdue Maintenance',
      value: mockCriticalEquipment.filter(e => isMaintenanceOverdue(e.next_maintenance)).length,
      description: 'Require immediate attention',
      icon: AlertTriangle,
    },
    {
      title: 'Low Spare Parts',
      value: mockCriticalEquipment.filter(e => e.spare_parts_status === 'low' || e.spare_parts_status === 'critical' || e.spare_parts_status === 'none').length,
      description: 'Need restocking',
      icon: Package,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Critical Equipment</h1>
            <p className="text-muted-foreground">
              ISM critical equipment status monitoring and maintenance tracking
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Equipment
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
                  placeholder="Search equipment by name, code, vessel, or manufacturer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedSystem === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedSystem('all')}
                  size="sm"
                >
                  All Systems
                </Button>
                {systemTypes.slice(0, 4).map(system => (
                  <Button
                    key={system}
                    variant={selectedSystem === system ? 'default' : 'outline'}
                    onClick={() => setSelectedSystem(system)}
                    size="sm"
                  >
                    {system}
                  </Button>
                ))}
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
                  variant={selectedStatus === 'critical' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('critical')}
                  size="sm"
                >
                  Critical
                </Button>
                <Button
                  variant={selectedStatus === 'poor' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('poor')}
                  size="sm"
                >
                  Poor
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Equipment Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Critical Equipment ({filteredEquipment.length})</CardTitle>
            <CardDescription>
              Equipment status monitoring and maintenance tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Vessel & System</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Maintenance</TableHead>
                  <TableHead>Spare Parts</TableHead>
                  <TableHead>Test Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipment.map((equipment) => (
                  <TableRow key={equipment.id}>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <Wrench className="w-4 h-4 text-muted-foreground" />
                          {equipment.ism_critical && (
                            <Shield className="w-3 h-3 text-red-500" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {equipment.equipment_name}
                            {equipment.ism_critical && (
                              <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                                ISM Critical
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {equipment.equipment_code} • {equipment.manufacturer}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            S/N: {equipment.serial_number}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <Ship className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{equipment.vessel}</span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {equipment.system} • {equipment.location}
                        </div>
                        {equipment.backup_available && (
                          <Badge variant="outline" className="text-xs mt-1">
                            Backup Available
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getMaintenanceStatusBadge(equipment.maintenance_status)}
                      {equipment.condition_monitoring && (
                        <div className="flex items-center gap-1 mt-1">
                          <Activity className="w-3 h-3 text-blue-500" />
                          <span className="text-xs text-blue-600">Monitored</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className={`flex items-center gap-1 ${
                          isMaintenanceOverdue(equipment.next_maintenance) ? 'text-red-600' : ''
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {new Date(equipment.next_maintenance).toLocaleDateString()}
                          {isMaintenanceOverdue(equipment.next_maintenance) && (
                            <AlertTriangle className="w-3 h-3 text-red-500 ml-1" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {equipment.responsible_officer}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {getSparePartsStatusBadge(equipment.spare_parts_status)}
                        <div className="text-xs text-muted-foreground mt-1">
                          {equipment.spare_parts_count} items
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTestStatusIcon(equipment.test_status)}
                        <div className="text-sm">
                          <div className="capitalize">{equipment.test_status}</div>
                          <div className="text-xs text-muted-foreground">
                            {equipment.test_frequency}
                          </div>
                        </div>
                      </div>
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
                            Update Status
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Wrench className="h-4 w-4" />
                            Schedule Maintenance
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <TestTube className="h-4 w-4" />
                            Record Test
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Package className="h-4 w-4" />
                            Manage Spares
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2">
                            <FileText className="h-4 w-4" />
                            View History
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredEquipment.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No critical equipment found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Attention Required
              </CardTitle>
              <CardDescription>Equipment needing immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockCriticalEquipment
                  .filter(eq => 
                    eq.maintenance_status === 'critical' || 
                    eq.maintenance_status === 'poor' ||
                    isMaintenanceOverdue(eq.next_maintenance) ||
                    eq.spare_parts_status === 'critical' ||
                    eq.spare_parts_status === 'none'
                  )
                  .slice(0, 4)
                  .map((equipment) => (
                    <div key={equipment.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{equipment.equipment_name}</p>
                        <p className="text-xs text-muted-foreground">{equipment.vessel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {equipment.maintenance_status === 'critical' && (
                          <Badge className="bg-red-100 text-red-800 text-xs">Critical</Badge>
                        )}
                        {isMaintenanceOverdue(equipment.next_maintenance) && (
                          <Badge className="bg-orange-100 text-orange-800 text-xs">Overdue</Badge>
                        )}
                        {(equipment.spare_parts_status === 'critical' || equipment.spare_parts_status === 'none') && (
                          <Badge className="bg-yellow-100 text-yellow-800 text-xs">No Spares</Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                System Health Overview
              </CardTitle>
              <CardDescription>Overall equipment condition by system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {systemTypes.slice(0, 4).map((system) => {
                  const systemEquipment = mockCriticalEquipment.filter(eq => eq.system === system);
                  const healthyCount = systemEquipment.filter(eq => 
                    eq.maintenance_status === 'excellent' || eq.maintenance_status === 'good'
                  ).length;
                  const healthPercent = (healthyCount / systemEquipment.length) * 100;
                  
                  return (
                    <div key={system} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{system}</span>
                        <span className="text-sm text-muted-foreground">
                          {healthyCount}/{systemEquipment.length}
                        </span>
                      </div>
                      <Progress value={healthPercent} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CriticalEquipment;