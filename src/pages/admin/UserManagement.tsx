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
  Users, 
  Search, 
  UserPlus, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Shield, 
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: 'active' | 'inactive' | 'pending';
  last_login?: string;
  vessels_access?: string[];
  created_at: string;
}

// Mock data for demo purposes
const mockUsers: User[] = [
  {
    id: '1',
    email: 'john.doe@maritime.com',
    first_name: 'John',
    last_name: 'Doe',
    role: 'master',
    status: 'active',
    last_login: '2024-01-29T10:30:00Z',
    vessels_access: ['MV Atlantic', 'MV Pacific'],
    created_at: '2023-06-15T08:00:00Z'
  },
  {
    id: '2',
    email: 'sarah.johnson@maritime.com',
    first_name: 'Sarah',
    last_name: 'Johnson',
    role: 'dpa',
    status: 'active',
    last_login: '2024-01-30T14:22:00Z',
    vessels_access: ['All Vessels'],
    created_at: '2023-03-10T09:15:00Z'
  },
  {
    id: '3',
    email: 'mike.wilson@maritime.com',
    first_name: 'Mike',
    last_name: 'Wilson',
    role: 'chief_engineer',
    status: 'active',
    last_login: '2024-01-28T16:45:00Z',
    vessels_access: ['MV Atlantic'],
    created_at: '2023-08-22T11:30:00Z'
  },
  {
    id: '4',
    email: 'lisa.brown@maritime.com',
    first_name: 'Lisa',
    last_name: 'Brown',
    role: 'crew',
    status: 'pending',
    vessels_access: ['MV Pacific'],
    created_at: '2024-01-25T13:00:00Z'
  },
  {
    id: '5',
    email: 'robert.garcia@maritime.com',
    first_name: 'Robert',
    last_name: 'Garcia',
    role: 'shore_management',
    status: 'inactive',
    last_login: '2024-01-15T09:12:00Z',
    vessels_access: ['MV Atlantic', 'MV Pacific', 'MV Explorer'],
    created_at: '2023-11-05T14:20:00Z'
  }
];

const UserManagement: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  const roleLabels: Record<string, string> = {
    master: 'Master',
    chief_engineer: 'Chief Engineer',
    chief_officer: 'Chief Officer',
    crew: 'Crew',
    dpa: 'DPA',
    shore_management: 'Shore Management',
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'inactive':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-warning" />;
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-success/20 text-success border-success/30">Active</Badge>;
      case 'inactive':
        return <Badge variant="destructive">Inactive</Badge>;
      case 'pending':
        return <Badge className="bg-warning/20 text-warning border-warning/30">Pending</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      master: 'bg-blue-100 text-blue-800 border-blue-200',
      dpa: 'bg-purple-100 text-purple-800 border-purple-200',
      shore_management: 'bg-green-100 text-green-800 border-green-200',
      chief_engineer: 'bg-orange-100 text-orange-800 border-orange-200',
      chief_officer: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      crew: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
      <Badge className={colors[role] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {roleLabels[role] || role}
      </Badge>
    );
  };

  const filteredUsers = useMemo(() => {
    let filtered = mockUsers;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.first_name.toLowerCase().includes(query) ||
          user.last_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          roleLabels[user.role]?.toLowerCase().includes(query)
      );
    }

    // Filter by role
    if (selectedRole !== 'all') {
      filtered = filtered.filter((user) => user.role === selectedRole);
    }

    return filtered;
  }, [mockUsers, searchQuery, selectedRole]);

  const formatLastLogin = (lastLogin?: string) => {
    if (!lastLogin) return 'Never';
    const date = new Date(lastLogin);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
  };

  const stats = [
    {
      title: 'Total Users',
      value: mockUsers.length,
      description: 'Registered users',
      icon: Users,
    },
    {
      title: 'Active Users',
      value: mockUsers.filter(u => u.status === 'active').length,
      description: 'Currently active',
      icon: CheckCircle,
    },
    {
      title: 'Pending Approval',
      value: mockUsers.filter(u => u.status === 'pending').length,
      description: 'Awaiting activation',
      icon: Clock,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground">
              Manage user accounts, roles, and access permissions
            </p>
          </div>
          <Button className="gap-2">
            <UserPlus className="w-4 h-4" />
            Add User
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
                  placeholder="Search users by name, email, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedRole === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedRole('all')}
                >
                  All Roles
                </Button>
                <Button
                  variant={selectedRole === 'dpa' ? 'default' : 'outline'}
                  onClick={() => setSelectedRole('dpa')}
                >
                  DPA
                </Button>
                <Button
                  variant={selectedRole === 'master' ? 'default' : 'outline'}
                  onClick={() => setSelectedRole('master')}
                >
                  Masters
                </Button>
                <Button
                  variant={selectedRole === 'crew' ? 'default' : 'outline'}
                  onClick={() => setSelectedRole('crew')}
                >
                  Crew
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
            <CardDescription>
              Manage user accounts and access permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vessel Access</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {user.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getRoleBadge(user.role)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(user.status)}
                        {getStatusBadge(user.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.vessels_access?.join(', ') || 'No access'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {formatLastLogin(user.last_login)}
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
                            Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Shield className="h-4 w-4" />
                            Manage Access
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="h-4 w-4" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No users found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default UserManagement;