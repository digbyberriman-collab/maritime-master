import React, { useState, useMemo, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  RefreshCw,
  Webhook,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

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

interface WebhookConfig {
  id: string;
  name: string;
  description: string | null;
  webhook_secret: string;
  is_active: boolean;
  allowed_data_types: string[];
  allowed_ip_addresses: string[] | null;
  rate_limit_per_minute: number;
  created_at: string;
  last_used_at: string | null;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  data_type: string;
  status: string;
  records_created: number;
  records_updated: number;
  records_failed: number;
  error_message: string | null;
  created_at: string;
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
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  
  // Webhook state
  const [webhookConfigs, setWebhookConfigs] = useState<WebhookConfig[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [showCreateWebhook, setShowCreateWebhook] = useState(false);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookDesc, setNewWebhookDesc] = useState('');
  const [newWebhookDataTypes, setNewWebhookDataTypes] = useState<string[]>(['crew', 'vessel', 'document', 'incident']);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  // Load webhook configurations
  useEffect(() => {
    if (profile?.company_id) {
      loadWebhookConfigs();
      loadWebhookEvents();
    }
  }, [profile?.company_id]);

  const loadWebhookConfigs = async () => {
    setLoadingWebhooks(true);
    const { data, error } = await supabase
      .from('webhook_configurations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setWebhookConfigs(data as WebhookConfig[]);
    }
    setLoadingWebhooks(false);
  };

  const loadWebhookEvents = async () => {
    const { data, error } = await supabase
      .from('webhook_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (!error && data) {
      setWebhookEvents(data as WebhookEvent[]);
    }
  };

  const generateWebhookSecret = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'whsec_';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const createWebhookConfig = async () => {
    if (!newWebhookName.trim() || !profile?.company_id) return;

    const { data, error } = await supabase
      .from('webhook_configurations')
      .insert({
        company_id: profile.company_id,
        name: newWebhookName.trim(),
        description: newWebhookDesc.trim() || null,
        webhook_secret: generateWebhookSecret(),
        allowed_data_types: newWebhookDataTypes,
        created_by: profile.user_id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: 'Failed to create webhook configuration', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Webhook configuration created' });
      setWebhookConfigs([data as WebhookConfig, ...webhookConfigs]);
      setShowCreateWebhook(false);
      setNewWebhookName('');
      setNewWebhookDesc('');
      setNewWebhookDataTypes(['crew', 'vessel', 'document', 'incident']);
    }
  };

  const toggleWebhookActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from('webhook_configurations')
      .update({ is_active: !isActive })
      .eq('id', id);

    if (!error) {
      setWebhookConfigs(webhookConfigs.map(w => w.id === id ? { ...w, is_active: !isActive } : w));
      toast({ title: 'Updated', description: `Webhook ${!isActive ? 'enabled' : 'disabled'}` });
    }
  };

  const deleteWebhookConfig = async (id: string) => {
    const { error } = await supabase
      .from('webhook_configurations')
      .delete()
      .eq('id', id);

    if (!error) {
      setWebhookConfigs(webhookConfigs.filter(w => w.id !== id));
      toast({ title: 'Deleted', description: 'Webhook configuration removed' });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Copied to clipboard' });
  };

  const webhookEndpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inbound-webhook`;

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
        return <XCircle className="w-4 h-4 text-muted-foreground" />;
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2">
              <Webhook className="w-4 h-4" />
              Inbound Webhooks
            </TabsTrigger>
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

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="space-y-4">
            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Webhook className="w-5 h-5" />
                    Inbound Webhook Configurations
                  </CardTitle>
                  <CardDescription>
                    Receive data from external platforms via webhooks
                  </CardDescription>
                </div>
                <Dialog open={showCreateWebhook} onOpenChange={setShowCreateWebhook}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="w-4 h-4" />
                      Create Webhook
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Webhook Configuration</DialogTitle>
                      <DialogDescription>
                        Set up a new webhook endpoint for receiving data from external systems.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="webhook_name">Name</Label>
                        <Input
                          id="webhook_name"
                          placeholder="e.g., Crewing System Integration"
                          value={newWebhookName}
                          onChange={(e) => setNewWebhookName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="webhook_desc">Description (optional)</Label>
                        <Textarea
                          id="webhook_desc"
                          placeholder="Describe this webhook's purpose..."
                          value={newWebhookDesc}
                          onChange={(e) => setNewWebhookDesc(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Allowed Data Types</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {['crew', 'vessel', 'document', 'incident'].map((type) => (
                            <div key={type} className="flex items-center space-x-2">
                              <Checkbox
                                id={`type_${type}`}
                                checked={newWebhookDataTypes.includes(type)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setNewWebhookDataTypes([...newWebhookDataTypes, type]);
                                  } else {
                                    setNewWebhookDataTypes(newWebhookDataTypes.filter(t => t !== type));
                                  }
                                }}
                              />
                              <Label htmlFor={`type_${type}`} className="capitalize">{type}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCreateWebhook(false)}>Cancel</Button>
                      <Button onClick={createWebhookConfig} disabled={!newWebhookName.trim()}>
                        Create Webhook
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {/* Endpoint Info */}
                <div className="bg-muted rounded-lg p-4 mb-6">
                  <Label className="text-sm font-medium">Webhook Endpoint URL</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 bg-background p-2 rounded text-sm font-mono overflow-x-auto">
                      {webhookEndpoint}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(webhookEndpoint)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Send POST requests to this URL with the <code>x-webhook-secret</code> header.
                  </p>
                </div>

                {loadingWebhooks ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : webhookConfigs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Webhook className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No webhook configurations yet</p>
                    <p className="text-sm">Create one to start receiving data</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Secret</TableHead>
                        <TableHead>Data Types</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Used</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhookConfigs.map((config) => (
                        <TableRow key={config.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{config.name}</div>
                              {config.description && (
                                <div className="text-xs text-muted-foreground">{config.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                {showSecret[config.id] ? config.webhook_secret : '••••••••••••••••'}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowSecret({ ...showSecret, [config.id]: !showSecret[config.id] })}
                              >
                                {showSecret[config.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(config.webhook_secret)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {config.allowed_data_types.map((type) => (
                                <Badge key={type} variant="outline" className="text-xs capitalize">
                                  {type}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={config.is_active}
                              onCheckedChange={() => toggleWebhookActive(config.id, config.is_active)}
                            />
                          </TableCell>
                          <TableCell>
                            {config.last_used_at ? (
                              <span className="text-sm">{new Date(config.last_used_at).toLocaleString()}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Never</span>
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
                                <DropdownMenuItem className="gap-2" onClick={() => copyToClipboard(config.webhook_secret)}>
                                  <Copy className="h-4 w-4" />
                                  Copy Secret
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-destructive"
                                  onClick={() => deleteWebhookConfig(config.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Recent Webhook Events */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Recent Webhook Events</CardTitle>
                <CardDescription>Latest incoming webhook requests</CardDescription>
              </CardHeader>
              <CardContent>
                {webhookEvents.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    No webhook events yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Data Type</TableHead>
                        <TableHead>Results</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhookEvents.slice(0, 10).map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="text-sm">
                            {new Date(event.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="capitalize">{event.event_type}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{event.data_type}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="text-green-600">+{event.records_created}</span>
                            {' / '}
                            <span className="text-blue-600">~{event.records_updated}</span>
                            {event.records_failed > 0 && (
                              <>
                                {' / '}
                                <span className="text-red-600">✗{event.records_failed}</span>
                              </>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={event.status === 'completed' ? 'default' : event.status === 'failed' ? 'destructive' : 'secondary'}
                            >
                              {event.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* API Documentation */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Webhook API Documentation</CardTitle>
                <CardDescription>How to send data to this webhook</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-medium">Request Format</Label>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`POST ${webhookEndpoint}
Content-Type: application/json
x-webhook-secret: whsec_your_secret_here

{
  "event_type": "create" | "update" | "delete" | "sync",
  "data_type": "crew" | "vessel" | "document" | "incident",
  "data": { ... } // or array of objects
}`}
                  </pre>
                </div>
                <div className="space-y-2">
                  <Label className="font-medium">Example: Create Crew Member</Label>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`{
  "event_type": "create",
  "data_type": "crew",
  "data": {
    "external_id": "EMP001",
    "first_name": "John",
    "last_name": "Smith",
    "rank": "Chief Officer",
    "nationality": "Philippines",
    "email": "john.smith@example.com"
  }
}`}
                  </pre>
                </div>
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