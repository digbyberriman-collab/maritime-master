import React, { useState, useMemo, useEffect } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
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
  Globe,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import AddFleetGroupModal from '@/shared/components/modals/AddFleetGroupModal';
import DeleteConfirmModal from '@/shared/components/modals/DeleteConfirmModal';

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

// Initial mock data
const initialMockFleetGroups: FleetGroup[] = [
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
  const { toast } = useToast();
  const [groups, setGroups] = useState<FleetGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FleetGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<FleetGroup | null>(null);
  const [loading, setLoading] = useState(false);

  // Load groups from localStorage on component mount
  useEffect(() => {
    const savedGroups = localStorage.getItem('maritime-fleet-groups');
    if (savedGroups) {
      try {
        setGroups(JSON.parse(savedGroups));
      } catch (error) {
        console.error('Failed to parse saved fleet groups:', error);
        setGroups(initialMockFleetGroups);
      }
    } else {
      setGroups(initialMockFleetGroups);
    }
  }, []);

  // Save groups to localStorage whenever groups change
  useEffect(() => {
    if (groups.length > 0) {
      localStorage.setItem('maritime-fleet-groups', JSON.stringify(groups));
    }
  }, [groups]);

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

  const handleAddGroup = () => {
    setEditingGroup(null);
    setIsAddModalOpen(true);
  };

  const handleEditGroup = (group: FleetGroup) => {
    setEditingGroup(group);
    setIsAddModalOpen(true);
  };

  const handleDeleteGroup = (group: FleetGroup) => {
    setDeletingGroup(group);
    setIsDeleteModalOpen(true);
  };

  const handleGroupAdded = (group: FleetGroup) => {
    if (editingGroup) {
      // Update existing group
      setGroups(prev => prev.map(g => g.id === group.id ? group : g));
      toast({
        title: 'Group Updated',
        description: `Fleet group "${group.name}" has been updated successfully.`,
      });
    } else {
      // Add new group
      setGroups(prev => [...prev, group]);
      toast({
        title: 'Group Created',
        description: `Fleet group "${group.name}" has been created successfully.`,
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingGroup) return;

    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setGroups(prev => prev.filter(g => g.id !== deletingGroup.id));
      
      toast({
        title: 'Group Deleted',
        description: `Fleet group "${deletingGroup.name}" has been deleted.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete fleet group. Please try again.',
        variant: 'destructive',
      });
    }
    
    setLoading(false);
    setDeletingGroup(null);
  };

  const handleChangeGroupColor = async (group: FleetGroup, newColor: string) => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setGroups(prev => prev.map(g => 
        g.id === group.id 
          ? { ...g, color: newColor }
          : g
      ));
      
      toast({
        title: 'Color Updated',
        description: `Color for "${group.name}" has been updated.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update group color. Please try again.',
        variant: 'destructive',
      });
    }
    
    setLoading(false);
  };

  const handleResetData = () => {
    setGroups(initialMockFleetGroups);
    localStorage.setItem('maritime-fleet-groups', JSON.stringify(initialMockFleetGroups));
    toast({
      title: 'Data Reset',
      description: 'Fleet group data has been reset to default values.',
    });
  };

  const filteredGroups = useMemo(() => {
    let filtered = groups;

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
  }, [groups, searchQuery, selectedType]);

  const stats = [
    {
      title: 'Total Groups',
      value: groups.length,
      description: 'Fleet groups configured',
      icon: Building,
    },
    {
      title: 'Total Vessels',
      value: groups.reduce((acc, group) => acc + group.vessels.length, 0),
      description: 'Vessels assigned to groups',
      icon: Ship,
    },
    {
      title: 'Managers',
      value: new Set(groups.map(g => g.manager).filter(Boolean)).size,
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleResetData} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Reset Data
            </Button>
            <Button onClick={handleAddGroup} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Group
            </Button>
          </div>
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
                          className="w-4 h-4 rounded-full border-2 cursor-pointer hover:scale-110 transition-transform"
                          style={{
                            backgroundColor: group.color,
                            borderColor: group.color,
                          }}
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'color';
                            input.value = group.color;
                            input.onchange = (e) => {
                              const target = e.target as HTMLInputElement;
                              handleChangeGroupColor(group, target.value);
                            };
                            input.click();
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
                          <Button variant="ghost" className="h-8 w-8 p-0" disabled={loading}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem 
                            className="gap-2"
                            onClick={() => handleEditGroup(group)}
                          >
                            <Edit className="h-4 w-4" />
                            Edit Group
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Ship className="h-4 w-4" />
                            View Vessels
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="gap-2"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'color';
                              input.value = group.color;
                              input.onchange = (e) => {
                                const target = e.target as HTMLInputElement;
                                handleChangeGroupColor(group, target.value);
                              };
                              input.click();
                            }}
                          >
                            <Palette className="h-4 w-4" />
                            Change Color
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="gap-2 text-destructive"
                            onClick={() => handleDeleteGroup(group)}
                          >
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
              Visual identification for fleet groups (click colors to change)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {groups.map((group) => (
                <div key={group.id} className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full border-2 cursor-pointer hover:scale-110 transition-transform"
                    style={{
                      backgroundColor: group.color,
                      borderColor: group.color,
                    }}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'color';
                      input.value = group.color;
                      input.onchange = (e) => {
                        const target = e.target as HTMLInputElement;
                        handleChangeGroupColor(group, target.value);
                      };
                      input.click();
                    }}
                  />
                  <span className="text-sm font-medium">{group.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Add/Edit Group Modal */}
        <AddFleetGroupModal
          open={isAddModalOpen}
          onOpenChange={setIsAddModalOpen}
          onGroupAdded={handleGroupAdded}
          editGroup={editingGroup}
        />

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          open={isDeleteModalOpen}
          onOpenChange={setIsDeleteModalOpen}
          onConfirm={handleConfirmDelete}
          title="Delete Fleet Group"
          description={`Are you sure you want to delete the fleet group "${deletingGroup?.name}"? This action cannot be undone.`}
          confirmText="Delete Group"
        />
      </div>
    </DashboardLayout>
  );
};

export default FleetGroups;