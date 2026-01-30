import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  Bell, 
  Search, 
  Plus, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Mail,
  MessageSquare,
  Zap,
  Settings
} from 'lucide-react';

interface AlertRule {
  id: string;
  name: string;
  category: string;
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  channels: string[];
  recipients?: string[];
  escalation_delay?: number;
  created_by: string;
  created_at: string;
  last_triggered?: string;
  trigger_count: number;
}

// Mock data for demo purposes
const mockAlertRules: AlertRule[] = [
  {
    id: '1',
    name: 'Certificate Expiring Soon',
    category: 'Certificates',
    condition: 'Certificate expires within 30 days',
    severity: 'medium',
    enabled: true,
    channels: ['email', 'dashboard'],
    recipients: ['dpa@maritime.com', 'fleet@maritime.com'],
    escalation_delay: 24,
    created_by: 'Sarah Johnson',
    created_at: '2023-06-15T08:00:00Z',
    last_triggered: '2024-01-29T10:30:00Z',
    trigger_count: 15
  },
  {
    id: '2',
    name: 'Critical Incident Reported',
    category: 'Incidents',
    condition: 'Incident severity is Critical or Major',
    severity: 'critical',
    enabled: true,
    channels: ['email', 'sms', 'dashboard'],
    recipients: ['dpa@maritime.com', 'emergency@maritime.com'],
    escalation_delay: 1,
    created_by: 'System Administrator',
    created_at: '2023-03-10T09:15:00Z',
    last_triggered: '2024-01-25T14:20:00Z',
    trigger_count: 3
  },
  {
    id: '3',
    name: 'Overdue CAPA Items',
    category: 'Compliance',
    condition: 'CAPA item is 7+ days overdue',
    severity: 'high',
    enabled: true,
    channels: ['email', 'dashboard'],
    recipients: ['compliance@maritime.com'],
    escalation_delay: 48,
    created_by: 'Mike Rodriguez',
    created_at: '2023-08-22T11:30:00Z',
    last_triggered: '2024-01-28T09:15:00Z',
    trigger_count: 8
  },
  {
    id: '4',
    name: 'Crew Hours of Rest Violation',
    category: 'Crew',
    condition: 'Hours of rest < minimum required',
    severity: 'high',
    enabled: true,
    channels: ['email', 'dashboard'],
    recipients: ['master@vessel.com', 'dpa@maritime.com'],
    escalation_delay: 2,
    created_by: 'System Administrator',
    created_at: '2023-11-05T14:20:00Z',
    trigger_count: 0
  },
  {
    id: '5',
    name: 'Maintenance Due',
    category: 'Maintenance',
    condition: 'Planned maintenance due within 7 days',
    severity: 'low',
    enabled: false,
    channels: ['dashboard'],
    recipients: ['maintenance@maritime.com'],
    escalation_delay: 72,
    created_by: 'David Wilson',
    created_at: '2024-01-10T10:00:00Z',
    trigger_count: 0
  },
  {
    id: '6',
    name: 'Document Review Overdue',
    category: 'Documents',
    condition: 'Document review is 30+ days overdue',
    severity: 'medium',
    enabled: true,
    channels: ['email'],
    recipients: ['documents@maritime.com'],
    escalation_delay: 168,
    created_by: 'Elena Rossi',
    created_at: '2023-12-01T16:45:00Z',
    last_triggered: '2024-01-20T11:00:00Z',
    trigger_count: 5
  }
];

const AlertConfiguration: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  const severityLabels: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-800 border-gray-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      critical: 'bg-red-100 text-red-800 border-red-200',
    };

    return (
      <Badge className={colors[severity] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {severityLabels[severity] || severity}
      </Badge>
    );
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'medium':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'low':
        return <CheckCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getChannelIcons = (channels: string[]) => {
    const iconMap: Record<string, React.ReactNode> = {
      email: <Mail className="w-3 h-3" />,
      sms: <MessageSquare className="w-3 h-3" />,
      dashboard: <Bell className="w-3 h-3" />,
      webhook: <Zap className="w-3 h-3" />,
    };

    return channels.map(channel => (
      <div key={channel} className="flex items-center gap-1 text-xs">
        {iconMap[channel]}
        <span className="capitalize">{channel}</span>
      </div>
    ));
  };

  const toggleAlertRule = (id: string, enabled: boolean) => {
    // In real app, this would update the backend
    console.log(`Toggle alert rule ${id} to ${enabled}`);
  };

  const filteredRules = useMemo(() => {
    let filtered = mockAlertRules;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (rule) =>
          rule.name.toLowerCase().includes(query) ||
          rule.category.toLowerCase().includes(query) ||
          rule.condition.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((rule) => rule.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    // Filter by severity
    if (selectedSeverity !== 'all') {
      filtered = filtered.filter((rule) => rule.severity === selectedSeverity);
    }

    return filtered;
  }, [mockAlertRules, searchQuery, selectedCategory, selectedSeverity]);

  const stats = [
    {
      title: 'Total Rules',
      value: mockAlertRules.length,
      description: 'Alert rules configured',
      icon: Settings,
    },
    {
      title: 'Active Rules',
      value: mockAlertRules.filter(r => r.enabled).length,
      description: 'Currently enabled',
      icon: CheckCircle,
    },
    {
      title: 'Critical Alerts',
      value: mockAlertRules.filter(r => r.severity === 'critical').length,
      description: 'High priority rules',
      icon: AlertTriangle,
    },
  ];

  const categories = [...new Set(mockAlertRules.map(rule => rule.category))];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Alert Configuration</h1>
            <p className="text-muted-foreground">
              Configure alert rules, escalation settings, and notification channels
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Rule
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
                  placeholder="Search alert rules by name, category, or condition..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory('all')}
                  size="sm"
                >
                  All Categories
                </Button>
                {categories.map(category => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? 'default' : 'outline'}
                    onClick={() => setSelectedCategory(category)}
                    size="sm"
                  >
                    {category}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedSeverity === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedSeverity('all')}
                  size="sm"
                >
                  All Severity
                </Button>
                <Button
                  variant={selectedSeverity === 'critical' ? 'default' : 'outline'}
                  onClick={() => setSelectedSeverity('critical')}
                  size="sm"
                >
                  Critical
                </Button>
                <Button
                  variant={selectedSeverity === 'high' ? 'default' : 'outline'}
                  onClick={() => setSelectedSeverity('high')}
                  size="sm"
                >
                  High
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alert Rules Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Alert Rules ({filteredRules.length})</CardTitle>
            <CardDescription>
              Manage alert conditions, escalation, and notification settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Triggered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {getSeverityIcon(rule.severity)}
                          {rule.name}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          <strong>{rule.category}:</strong> {rule.condition}
                        </div>
                        {rule.escalation_delay && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Escalates after {rule.escalation_delay}h
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getSeverityBadge(rule.severity)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getChannelIcons(rule.channels)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{rule.trigger_count} times</div>
                        {rule.last_triggered && (
                          <div className="text-muted-foreground text-xs">
                            Last: {new Date(rule.last_triggered).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(checked) => toggleAlertRule(rule.id, checked)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
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
                            Edit Rule
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Bell className="h-4 w-4" />
                            Test Alert
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Users className="h-4 w-4" />
                            Manage Recipients
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="h-4 w-4" />
                            Delete Rule
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredRules.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No alert rules found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Setup Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Notification Channels
              </CardTitle>
              <CardDescription>Configure how alerts are delivered</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Email Notifications</span>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">SMS Alerts</span>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Dashboard Notifications</span>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Webhook Integration</span>
                <Switch />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Escalation Settings
              </CardTitle>
              <CardDescription>Default escalation timeframes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Critical Alerts</span>
                <span className="text-sm font-medium">1 hour</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">High Priority</span>
                <span className="text-sm font-medium">4 hours</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Medium Priority</span>
                <span className="text-sm font-medium">24 hours</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Low Priority</span>
                <span className="text-sm font-medium">72 hours</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AlertConfiguration;