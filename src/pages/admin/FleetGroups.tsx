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
  Ship, 
  Search, 
  Plus, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Users,
  Palette,
  MapPin,
  Building,
  Globe
} from 'lucide-react';

interface FleetGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  vessels: string[];
  manager?: string;
  region?: string;
  type: 'operational' | 'regional' | 'owner' | 'technical';
  created_at: string;
}

// Mock data for demo purposes
const mockFleetGroups: FleetGroup[] = [
  {
    id: '1',
    name: 'Atlantic Fleet',
    description: 'Vessels operating in Atlantic routes',
    color: '#3B82F6',
    vessels: ['MV Atlantic Pioneer', 'MV Ocean Explorer', 'MV North Star'],
    manager: 'Captain Sarah Johnson',
    region: 'North Atlantic',
    type: 'regional',
    created_at: '2023-06-15T08:00:00Z'
  },
  {
    id: '2',
    name: 'Pacific Operations',
    description: 'Pacific rim cargo operations',
    color: '#10B981',
    vessels: ['MV Pacific Voyager', 'MV Eastern Dawn'],
    manager: 'Captain Mike Rodriguez',
    region: 'Pacific',
    type: 'operational',
    created_at: '2023-08-22T11:30:00Z'
  },
  {
    id: '3',
    name: 'Bulk Carriers',
    description: 'Specialized bulk cargo vessels',
    color: '#F59E0B',
    vessels: ['MV Iron Duke', 'MV Grain Master', 'MV Coal Express'],
    manager: 'Captain Robert Chen',
    region: 'Global',
    type: 'operational',
    created_at: '2023-03-10T09:15:00Z'
  },
  {
    id: '4',
    name: 'Mediterranean Group',
    description: 'Mediterranean and European operations',
    color: '#8B5CF6',
    vessels: ['MV Med Express'],
    manager: 'Captain Elena Rossi',
    region: 'Mediterranean',
    type: 'regional',
    created_at: '2023-11-05T14:20:00Z'
  },
  {
    id: '5',
    name: 'Technical Management',
    description: 'Vessels under technical management contract',
    color: '#EF4444',
    vessels: ['MV Tech Leader', 'MV Innovation'],
    manager: 'Chief Engineer David Wilson',
    region: 'Global',
    type: 'technical',
    created_at: '2024-01-10T10:00:00Z'
  }
];

const FleetGroups: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  const typeLabels: Record<string, string> = {
    operational: 'Operational',
    regional: 'Regional',
    owner: 'Owner',
    technical: 'Technical',
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      operational: 'bg-blue-100 text-blue-800 border-blue-200',
      regional: 'bg-green-100 text-green-800 border-green-200',
      owner: 'bg-purple-100 text-purple-800 border-purple-200',
      technical: 'bg-orange-100 text-orange-800 border-orange-200',
    };

    return (
      <Badge className={colors[type] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {typeLabels[type] || type}
      </Badge>
    );
  };

  const getRegionIcon = (region?: string) => {
    if (!region) return <Globe className="w-4 h-4 text-muted-foreground" />;
    
    if (region.includes('Global')) return <Globe className="w-4 h-4 text-blue-500" />;
    if (region.includes('Atlantic')) return <MapPin className="w-4 h-4 text-blue-600" />;
    if (region.includes('Pacific')) return <MapPin className="w-4 h-4 text-green-600" />;
    if (region.includes('Mediterranean')) return <MapPin className="w-4 h-4 text-purple-600" />;
    
    return <MapPin className="w-4 h-4 text-muted-foreground" />;
  };

  const filteredGroups = useMemo(() => {
    let filtered = mockFleetGroups;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (group) =>
          group.name.toLowerCase().includes(query) ||
          group.description?.toLowerCase().includes(query) ||
          group.manager?.toLowerCase().includes(query) ||
          group.region?.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter((group) => group.type === selectedType);
    }

    return filtered;
  }, [mockFleetGroups, searchQuery, selectedType]);

  const stats = [
    {
      title: 'Total Groups',
      value: mockFleetGroups.length,
      description: 'Fleet groups configured',
      icon: Building,
    },
    {
      title: 'Total Vessels',
      value: mockFleetGroups.reduce((acc, group) => acc + group.vessels.length, 0),
      description: 'Vessels assigned to groups',
      icon: Ship,
    },
    {
      title: 'Managers',
      value: new Set(mockFleetGroups.map(g => g.manager).filter(Boolean)).size,
      description: 'Unique fleet managers',
      icon: Users,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fleet Groups</h1>
            <p className="text-muted-foreground">
              Organize vessels into manageable groups for operations and reporting
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Group
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
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search groups by name, manager, or region..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedType === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedType('all')}
                >
                  All Types
                </Button>
                <Button
                  variant={selectedType === 'operational' ? 'default' : 'outline'}
                  onClick={() => setSelectedType('operational')}
                >
                  Operational
                </Button>
                <Button
                  variant={selectedType === 'regional' ? 'default' : 'outline'}
                  onClick={() => setSelectedType('regional')}
                >
                  Regional
                </Button>
                <Button
                  variant={selectedType === 'technical' ? 'default' : 'outline'}
                  onClick={() => setSelectedType('technical')}
                >
                  Technical
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Groups Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Fleet Groups ({filteredGroups.length})</CardTitle>
            <CardDescription>
              Manage fleet groupings and vessel assignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Vessels</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full border-2"
                          style={{
                            backgroundColor: group.color,
                            borderColor: group.color,
                          }}
                        />
                        <div>
                          <div className="font-medium">{group.name}</div>
                          {group.description && (
                            <div className="text-sm text-muted-foreground">
                              {group.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getTypeBadge(group.type)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Ship className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{group.vessels.length}</span>
                        <span className="text-muted-foreground">vessels</span>
                      </div>
                      {group.vessels.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {group.vessels.slice(0, 2).join(', ')}
                          {group.vessels.length > 2 && ` +${group.vessels.length - 2} more`}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {group.manager ? (
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{group.manager}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getRegionIcon(group.region)}
                        <span className="text-sm">{group.region || 'Not specified'}</span>
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
                            <Edit className="h-4 w-4" />
                            Edit Group
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Ship className="h-4 w-4" />
                            Manage Vessels
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Palette className="h-4 w-4" />
                            Change Color
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="h-4 w-4" />
                            Delete Group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredGroups.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Building className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No fleet groups found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Color Legend */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Color Legend
            </CardTitle>
            <CardDescription>
              Visual identification for fleet groups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {mockFleetGroups.map((group) => (
                <div key={group.id} className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full border-2"
                    style={{
                      backgroundColor: group.color,
                      borderColor: group.color,
                    }}
                  />
                  <span className="text-sm font-medium">{group.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default FleetGroups;