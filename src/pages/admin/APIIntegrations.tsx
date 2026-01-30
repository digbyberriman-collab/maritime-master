import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
  Wrench, 
  Search, 
  Plus, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  Key,
  Globe,
  Database,
  Mail,
  Satellite,
  Ship,
  AlertTriangle,
  TestTube,
  RefreshCw
} from 'lucide-react';

interface APIIntegration {
  id: string;
  name: string;
  provider: string;
  type: 'ais' | 'weather' | 'email' | 'maintenance' | 'navigation' | 'port' | 'regulatory';
  status: 'active' | 'inactive' | 'error' | 'testing';
  api_endpoint: string;
  authentication_type: 'api_key' | 'oauth' | 'basic_auth' | 'bearer_token';
  last_sync: string;
  sync_frequency: string;
  data_points: number;
  error_count: number;
  success_rate: number;
  monthly_requests: number;
  request_limit: number;
  cost_per_request?: number;
  description: string;
  created_at: string;
  updated_at: string;
}

// Mock data for demo purposes
const mockIntegrations: APIIntegration[] = [
  {
    id: '1',
    name: 'AIS Position Data',
    provider: 'MarineTraffic',
    type: 'ais',
    status: 'active',
    api_endpoint: 'https://services.marinetraffic.com/api',
    authentication_type: 'api_key',
    last_sync: '2024-01-30T14:30:00Z',
    sync_frequency: 'Every 15 minutes',
    data_points: 2847,
    error_count: 12,
    success_rate: 99.2,
    monthly_requests: 127450,
    request_limit: 500000,
    cost_per_request: 0.002,
    description: 'Real-time vessel position tracking and AIS data integration',
    created_at: '2023-06-15T08:00:00Z',
    updated_at: '2024-01-30T14:30:00Z'
  },
  {
    id: '2',
    name: 'Weather Routing',
    provider: 'WeatherRouting Pro',
    type: 'weather',
    status: 'active',
    api_endpoint: 'https://api.weatherrouting.com/v2',
    authentication_type: 'oauth',
    last_sync: '2024-01-30T13:45:00Z',
    sync_frequency: 'Every 6 hours',
    data_points: 1256,
    error_count: 3,
    success_rate: 99.8,
    monthly_requests: 8450,
    request_limit: 50000,
    cost_per_request: 0.05,
    description: 'Weather data and route optimization for vessel planning',
    created_at: '2023-08-22T11:30:00Z',
    updated_at: '2024-01-30T13:45:00Z'
  },
  {
    id: '3',
    name: 'IDEA Maintenance System',
    provider: 'IDEA Marine',
    type: 'maintenance',
    status: 'error',
    api_endpoint: 'https://api.idea-marine.com/maintenance',
    authentication_type: 'bearer_token',
    last_sync: '2024-01-29T08:15:00Z',
    sync_frequency: 'Daily',
    data_points: 892,
    error_count: 45,
    success_rate: 94.2,
    monthly_requests: 3420,
    request_limit: 25000,
    cost_per_request: 0.01,
    description: 'Maintenance work orders and equipment status synchronization',
    created_at: '2023-03-10T09:15:00Z',
    updated_at: '2024-01-29T08:15:00Z'
  },
  {
    id: '4',
    name: 'Email Service',
    provider: 'SendGrid',
    type: 'email',
    status: 'active',
    api_endpoint: 'https://api.sendgrid.com/v3',
    authentication_type: 'api_key',
    last_sync: '2024-01-30T15:20:00Z',
    sync_frequency: 'Real-time',
    data_points: 5643,
    error_count: 8,
    success_rate: 99.6,
    monthly_requests: 45720,
    request_limit: 100000,
    cost_per_request: 0.0006,
    description: 'Email notifications and communication services',
    created_at: '2023-01-15T08:00:00Z',
    updated_at: '2024-01-30T15:20:00Z'
  },
  {
    id: '5',
    name: 'Port Information System',
    provider: 'Global Ports Network',
    type: 'port',
    status: 'testing',
    api_endpoint: 'https://api.globalports.com/v1',
    authentication_type: 'api_key',
    last_sync: '2024-01-30T10:00:00Z',
    sync_frequency: 'Every 4 hours',
    data_points: 234,
    error_count: 5,
    success_rate: 97.8,
    monthly_requests: 2340,
    request_limit: 15000,
    cost_per_request: 0.03,
    description: 'Port schedules, berth availability, and port call information',
    created_at: '2024-01-20T10:00:00Z',
    updated_at: '2024-01-30T10:00:00Z'
  },
  {
    id: '6',
    name: 'Navigation Data Service',
    provider: 'ChartWorld',
    type: 'navigation',
    status: 'inactive',
    api_endpoint: 'https://api.chartworld.com/data',
    authentication_type: 'basic_auth',
    last_sync: '2024-01-25T16:30:00Z',
    sync_frequency: 'Weekly',
    data_points: 567,
    error_count: 2,
    success_rate: 99.1,
    monthly_requests: 1250,
    request_limit: 10000,
    cost_per_request: 0.008,
    description: 'Electronic chart updates and navigational warnings',
    created_at: '2023-11-05T14:20:00Z',
    updated_at: '2024-01-25T16:30:00Z'
  }
];

const APIIntegrations: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const typeLabels: Record<string, string> = {
    ais: 'AIS Tracking',
    weather: 'Weather Data',
    email: 'Email Service',
    maintenance: 'Maintenance',
    navigation: 'Navigation',
    port: 'Port Information',
    regulatory: 'Regulatory',
  };

  const statusLabels: Record<string, string> = {
    active: 'Active',
    inactive: 'Inactive',
    error: 'Error',
    testing: 'Testing',
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800 border-green-200',
      inactive: 'bg-gray-100 text-gray-800 border-gray-200',
      error: 'bg-red-100 text-red-800 border-red-200',
      testing: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    };

    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {statusLabels[status] || status}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'inactive':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'testing':
        return <TestTube className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ais':
        return <Satellite className="w-4 h-4 text-blue-500" />;
      case 'weather':
        return <Globe className="w-4 h-4 text-green-500" />;
      case 'email':
        return <Mail className="w-4 h-4 text-purple-500" />;
      case 'maintenance':
        return <Wrench className="w-4 h-4 text-orange-500" />;
      case 'navigation':
        return <Ship className="w-4 h-4 text-cyan-500" />;
      case 'port':
        return <Database className="w-4 h-4 text-indigo-500" />;
      case 'regulatory':
        return <Settings className="w-4 h-4 text-red-500" />;
      default:
        return <Globe className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const filteredIntegrations = useMemo(() => {
    let filtered = mockIntegrations;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (integration) =>
          integration.name.toLowerCase().includes(query) ||
          integration.provider.toLowerCase().includes(query) ||
          integration.description.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter((integration) => integration.type === selectedType);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((integration) => integration.status === selectedStatus);
    }

    return filtered;
  }, [mockIntegrations, searchQuery, selectedType, selectedStatus]);

  const stats = [
    {
      title: 'Active Integrations',
      value: mockIntegrations.filter(i => i.status === 'active').length,
      description: 'Currently running',
      icon: CheckCircle,
    },
    {
      title: 'Total API Calls',
      value: mockIntegrations.reduce((sum, i) => sum + i.monthly_requests, 0).toLocaleString(),
      description: 'This month',
      icon: Database,
    },
    {
      title: 'Average Success Rate',
      value: `${Math.round(mockIntegrations.reduce((sum, i) => sum + i.success_rate, 0) / mockIntegrations.length)}%`,
      description: 'Across all services',
      icon: Settings,
    },
  ];

  const types = Object.keys(typeLabels);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">API Integrations</h1>
            <p className="text-muted-foreground">
              Manage third-party API connections and system integrations
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Integration
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

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Filters */}
            <Card className="shadow-card">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search integrations by name, provider, or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant={selectedType === 'all' ? 'default' : 'outline'}
                      onClick={() => setSelectedType('all')}
                      size="sm"
                    >
                      All Types
                    </Button>
                    {types.slice(0, 4).map(type => (
                      <Button
                        key={type}
                        variant={selectedType === type ? 'default' : 'outline'}
                        onClick={() => setSelectedType(type)}
                        size="sm"
                      >
                        {typeLabels[type]}
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
                      variant={selectedStatus === 'active' ? 'default' : 'outline'}
                      onClick={() => setSelectedStatus('active')}
                      size="sm"
                    >
                      Active
                    </Button>
                    <Button
                      variant={selectedStatus === 'error' ? 'default' : 'outline'}
                      onClick={() => setSelectedStatus('error')}
                      size="sm"
                    >
                      Errors
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Integrations Table */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>API Integrations ({filteredIntegrations.length})</CardTitle>
                <CardDescription>
                  Manage and monitor third-party API connections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Integration</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIntegrations.map((integration) => (
                      <TableRow key={integration.id}>
                        <TableCell>
                          <div className="flex items-start gap-3">
                            {getTypeIcon(integration.type)}
                            <div>
                              <div className="font-medium">{integration.name}</div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {integration.description}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {integration.sync_frequency}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{integration.provider}</div>
                          <div className="text-xs text-muted-foreground">
                            {integration.authentication_type}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {typeLabels[integration.type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(integration.status)}
                            {getStatusBadge(integration.status)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Last sync: {new Date(integration.last_sync).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{integration.success_rate}%</div>
                            <div className="text-xs text-muted-foreground">
                              {integration.error_count} errors
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">
                              {integration.monthly_requests.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              of {integration.request_limit.toLocaleString()}
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                              <div
                                className="bg-blue-600 h-1 rounded-full"
                                style={{
                                  width: `${Math.min((integration.monthly_requests / integration.request_limit) * 100, 100)}%`
                                }}
                              />
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
                                <Edit className="h-4 w-4" />
                                Configure
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                Test Connection
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2">
                                <Settings className="h-4 w-4" />
                                View Logs
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 text-destructive">
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {filteredIntegrations.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wrench className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No integrations found</p>
                    <p className="text-sm">Try adjusting your search criteria</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="configuration" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    API Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure API keys and authentication
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="api_key">API Key</Label>
                    <Input
                      id="api_key"
                      type="password"
                      placeholder="••••••••••••••••"
                      value="sk_live_123456789abcdef"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="endpoint">Endpoint URL</Label>
                    <Input
                      id="endpoint"
                      placeholder="https://api.example.com/v1"
                      value="https://services.marinetraffic.com/api"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (seconds)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      value="30"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch id="ssl_verify" defaultChecked />
                    <Label htmlFor="ssl_verify">Verify SSL certificates</Label>
                  </div>

                  <Button className="w-full">
                    Save Configuration
                  </Button>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Sync Settings
                  </CardTitle>
                  <CardDescription>
                    Data synchronization preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sync_interval">Sync Interval</Label>
                    <select
                      id="sync_interval"
                      className="w-full p-2 border border-input rounded-md"
                    >
                      <option value="5">Every 5 minutes</option>
                      <option value="15" selected>Every 15 minutes</option>
                      <option value="30">Every 30 minutes</option>
                      <option value="60">Every hour</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="retry_attempts">Retry Attempts</Label>
                    <Input
                      id="retry_attempts"
                      type="number"
                      value="3"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="batch_size">Batch Size</Label>
                    <Input
                      id="batch_size"
                      type="number"
                      value="100"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch id="auto_retry" defaultChecked />
                    <Label htmlFor="auto_retry">Auto-retry failed requests</Label>
                  </div>

                  <Button className="w-full">
                    Update Settings
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="monitoring" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest API calls and responses</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((_, index) => (
                      <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <div>
                            <p className="text-sm font-medium">AIS Position Update</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(Date.now() - index * 300000).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-800 text-xs">
                          200 OK
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Error Log</CardTitle>
                  <CardDescription>Recent integration errors</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                        <div>
                          <p className="text-sm font-medium">IDEA API Timeout</p>
                          <p className="text-xs text-muted-foreground">
                            15 minutes ago
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-red-100 text-red-800 text-xs">
                        504
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between py-2 border-b">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                        <div>
                          <p className="text-sm font-medium">Rate limit exceeded</p>
                          <p className="text-xs text-muted-foreground">
                            2 hours ago
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                        429
                      </Badge>
                    </div>

                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No other recent errors
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default APIIntegrations;