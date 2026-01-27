import React, { useState } from 'react';
import { Plug, Ship, Wrench, Mail, Table, RefreshCw, Check, X, AlertCircle, Settings, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Integration {
  id: string;
  name: string;
  provider: string;
  description: string;
  icon: React.ElementType;
  status: 'connected' | 'disconnected' | 'error';
  lastSync: string | null;
  config?: {
    apiKey?: string;
    endpoint?: string;
    refreshInterval?: number;
  };
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'ais',
    name: 'AIS Provider',
    provider: 'MarineTraffic',
    description: 'Real-time vessel tracking and position data',
    icon: Ship,
    status: 'connected',
    lastSync: '2026-01-27T17:45:00Z',
    config: {
      apiKey: '••••••••••••',
      endpoint: 'https://services.marinetraffic.com/api',
      refreshInterval: 5
    }
  },
  {
    id: 'idea',
    name: 'IDEA Maintenance',
    provider: 'IDEA Fleet',
    description: 'Read-only maintenance and defect overlay',
    icon: Wrench,
    status: 'connected',
    lastSync: '2026-01-27T16:30:00Z',
    config: {
      apiKey: '••••••••••••',
      endpoint: 'https://api.ideafleet.com/v2',
      refreshInterval: 60
    }
  },
  {
    id: 'email',
    name: 'Email Service',
    provider: 'Not configured',
    description: 'Transactional email delivery service',
    icon: Mail,
    status: 'disconnected',
    lastSync: null
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    provider: 'Not configured',
    description: 'Optional data export to spreadsheets',
    icon: Table,
    status: 'disconnected',
    lastSync: null
  }
];

const IntegrationsSection: React.FC = () => {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>(INTEGRATIONS);
  const [configModal, setConfigModal] = useState<Integration | null>(null);
  const [configForm, setConfigForm] = useState({
    apiKey: '',
    endpoint: '',
    refreshInterval: 5
  });
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const openConfigModal = (integration: Integration) => {
    setConfigModal(integration);
    setConfigForm({
      apiKey: integration.config?.apiKey || '',
      endpoint: integration.config?.endpoint || '',
      refreshInterval: integration.config?.refreshInterval || 5
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    // Simulate API test
    await new Promise(resolve => setTimeout(resolve, 2000));
    setTesting(false);
    toast({
      title: 'Connection Successful',
      description: 'Successfully connected to the integration.',
    });
  };

  const handleManualSync = async (integrationId: string) => {
    setSyncing(integrationId);
    // Simulate sync
    await new Promise(resolve => setTimeout(resolve, 3000));
    setSyncing(null);
    
    setIntegrations(prev => prev.map(i => 
      i.id === integrationId 
        ? { ...i, lastSync: new Date().toISOString() }
        : i
    ));
    
    toast({
      title: 'Sync Complete',
      description: 'Data has been synchronized successfully.',
    });
  };

  const handleSaveConfig = () => {
    if (!configModal) return;
    
    setIntegrations(prev => prev.map(i => 
      i.id === configModal.id 
        ? { 
            ...i, 
            status: 'connected' as const,
            provider: getProviderName(configModal.id, configForm.endpoint),
            config: {
              apiKey: '••••••••••••',
              endpoint: configForm.endpoint,
              refreshInterval: configForm.refreshInterval
            }
          }
        : i
    ));
    
    setConfigModal(null);
    toast({
      title: 'Configuration Saved',
      description: 'Integration settings have been updated.',
    });
  };

  const getProviderName = (id: string, endpoint: string): string => {
    if (id === 'ais') {
      if (endpoint.includes('marinetraffic')) return 'MarineTraffic';
      if (endpoint.includes('vesselfinder')) return 'VesselFinder';
      return 'Custom AIS';
    }
    if (id === 'email') {
      if (endpoint.includes('sendgrid')) return 'SendGrid';
      if (endpoint.includes('postmark')) return 'Postmark';
      return 'Custom SMTP';
    }
    return endpoint ? 'Configured' : 'Not configured';
  };

  const getStatusBadge = (status: Integration['status']) => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Check className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            <X className="h-3 w-3 mr-1" />
            Disconnected
          </Badge>
        );
    }
  };

  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return 'Never';
    const date = new Date(lastSync);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Integrations</h2>
        <p className="text-muted-foreground mt-1">Manage third-party integrations and API connections</p>
      </div>

      <div className="space-y-4">
        {integrations.map(integration => {
          const Icon = integration.icon;
          return (
            <Card key={integration.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                      <Icon className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h4 className="font-medium">{integration.name}</h4>
                      <p className="text-sm text-muted-foreground">{integration.provider}</p>
                      <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {getStatusBadge(integration.status)}
                      <p className="text-xs text-muted-foreground mt-2">
                        Last sync: {formatLastSync(integration.lastSync)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {integration.status === 'connected' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleManualSync(integration.id)}
                          disabled={syncing === integration.id}
                        >
                          <RefreshCw className={`h-4 w-4 mr-1 ${syncing === integration.id ? 'animate-spin' : ''}`} />
                          {syncing === integration.id ? 'Syncing...' : 'Sync'}
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openConfigModal(integration)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Configure
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Configuration Modal */}
      <Dialog open={!!configModal} onOpenChange={() => setConfigModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure {configModal?.name}</DialogTitle>
            <DialogDescription>
              Enter the API credentials and settings for this integration.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter API key"
                value={configForm.apiKey}
                onChange={(e) => setConfigForm(prev => ({ ...prev, apiKey: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint URL</Label>
              <Input
                id="endpoint"
                type="url"
                placeholder="https://api.example.com/v1"
                value={configForm.endpoint}
                onChange={(e) => setConfigForm(prev => ({ ...prev, endpoint: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="refreshInterval">Refresh Interval</Label>
              <Select 
                value={String(configForm.refreshInterval)}
                onValueChange={(v) => setConfigForm(prev => ({ ...prev, refreshInterval: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Every 1 minute</SelectItem>
                  <SelectItem value="5">Every 5 minutes</SelectItem>
                  <SelectItem value="15">Every 15 minutes</SelectItem>
                  <SelectItem value="30">Every 30 minutes</SelectItem>
                  <SelectItem value="60">Every hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={handleTestConnection}
              disabled={testing || !configForm.apiKey || !configForm.endpoint}
            >
              {testing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
            <Button onClick={handleSaveConfig} disabled={!configForm.apiKey || !configForm.endpoint}>
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntegrationsSection;
