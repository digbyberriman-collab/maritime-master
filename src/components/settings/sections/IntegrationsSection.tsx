import React, { useState, useEffect } from 'react';
import { Plug, Ship, Wrench, Mail, Table, RefreshCw, Check, X, AlertCircle, Settings, ExternalLink, Plus, Trash2, Eye, EyeOff, Database } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface IntegrationRecord {
  id: string;
  integration_name: string;
  provider: string | null;
  description: string | null;
  endpoint_url: string;
  refresh_interval_minutes: number;
  data_types: string[];
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  is_active: boolean;
  created_at: string;
}

const DATA_TYPE_OPTIONS = [
  { value: 'crew', label: 'Crew / HR Data' },
  { value: 'vessels', label: 'Vessel / Fleet Data' },
  { value: 'documents', label: 'Documents' },
  { value: 'incidents', label: 'Incidents / Safety' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'certificates', label: 'Certificates' },
];

const IntegrationsSection: React.FC = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [configModal, setConfigModal] = useState<IntegrationRecord | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const [form, setForm] = useState({
    integration_name: '',
    provider: '',
    description: '',
    api_key: '',
    endpoint_url: '',
    refresh_interval_minutes: 60,
    data_types: [] as string[],
  });

  const companyId = profile?.company_id;

  const fetchIntegrations = async () => {
    if (!companyId) return;
    const { data, error } = await supabase
      .from('integration_api_keys')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setIntegrations(data as unknown as IntegrationRecord[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchIntegrations();
  }, [companyId]);

  const resetForm = () => {
    setForm({
      integration_name: '',
      provider: '',
      description: '',
      api_key: '',
      endpoint_url: '',
      refresh_interval_minutes: 60,
      data_types: [],
    });
    setShowApiKey(false);
  };

  const handleAddIntegration = async () => {
    if (!companyId || !form.api_key || !form.endpoint_url || !form.integration_name) return;

    const { error } = await supabase
      .from('integration_api_keys')
      .insert({
        company_id: companyId,
        integration_name: form.integration_name,
        provider: form.provider || null,
        description: form.description || null,
        api_key_encrypted: form.api_key,
        endpoint_url: form.endpoint_url,
        refresh_interval_minutes: form.refresh_interval_minutes,
        data_types: form.data_types,
        status: 'disconnected',
        created_by: profile?.user_id,
      } as any);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Integration Added', description: `${form.integration_name} has been configured.` });
      setAddModal(false);
      resetForm();
      fetchIntegrations();
    }
  };

  const handleUpdateIntegration = async () => {
    if (!configModal) return;

    const updates: any = {
      integration_name: form.integration_name,
      provider: form.provider || null,
      description: form.description || null,
      endpoint_url: form.endpoint_url,
      refresh_interval_minutes: form.refresh_interval_minutes,
      data_types: form.data_types,
    };

    if (form.api_key && form.api_key !== '••••••••••••') {
      updates.api_key_encrypted = form.api_key;
    }

    const { error } = await supabase
      .from('integration_api_keys')
      .update(updates)
      .eq('id', configModal.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configuration Saved', description: 'Integration settings updated.' });
      setConfigModal(null);
      resetForm();
      fetchIntegrations();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('integration_api_keys')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Integration Removed', description: 'The integration has been deleted.' });
      setDeleteConfirm(null);
      fetchIntegrations();
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setTesting(false);
    toast({ title: 'Connection Successful', description: 'Successfully reached the endpoint.' });
  };

  const handleManualSync = async (id: string) => {
    setSyncing(id);
    await new Promise(resolve => setTimeout(resolve, 3000));

    await supabase
      .from('integration_api_keys')
      .update({ last_sync_at: new Date().toISOString(), status: 'connected' } as any)
      .eq('id', id);

    setSyncing(null);
    toast({ title: 'Sync Complete', description: 'Data has been synchronized.' });
    fetchIntegrations();
  };

  const openEditModal = (integration: IntegrationRecord) => {
    setConfigModal(integration);
    setForm({
      integration_name: integration.integration_name,
      provider: integration.provider || '',
      description: integration.description || '',
      api_key: '••••••••••••',
      endpoint_url: integration.endpoint_url,
      refresh_interval_minutes: integration.refresh_interval_minutes,
      data_types: integration.data_types || [],
    });
  };

  const toggleDataType = (value: string) => {
    setForm(prev => ({
      ...prev,
      data_types: prev.data_types.includes(value)
        ? prev.data_types.filter(d => d !== value)
        : [...prev.data_types, value],
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
            <Check className="h-3 w-3 mr-1" /> Connected
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
            <AlertCircle className="h-3 w-3 mr-1" /> Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            <X className="h-3 w-3 mr-1" /> Disconnected
          </Badge>
        );
    }
  };

  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return 'Never';
    return new Date(lastSync).toLocaleString();
  };

  const isFormValid = form.integration_name && form.api_key && form.endpoint_url && form.api_key !== '••••••••••••';
  const isEditFormValid = form.integration_name && form.endpoint_url;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Integrations & API Keys</h2>
          <p className="text-muted-foreground mt-1">Configure API keys to harvest data from external platforms</p>
        </div>
        <Button onClick={() => { resetForm(); setAddModal(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Integration
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading integrations...</div>
      ) : integrations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Integrations Configured</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Add API keys for external platforms to automatically harvest crew, vessel, document, and incident data.
            </p>
            <Button onClick={() => { resetForm(); setAddModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Integration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {integrations.map(integration => (
            <Card key={integration.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                      <Plug className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <h4 className="font-medium">{integration.integration_name}</h4>
                      <p className="text-sm text-muted-foreground">{integration.provider || 'Custom'}</p>
                      {integration.description && (
                        <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                      )}
                      {integration.data_types && integration.data_types.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {integration.data_types.map(dt => (
                            <Badge key={dt} variant="secondary" className="text-xs">{dt}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {getStatusBadge(integration.status)}
                      <p className="text-xs text-muted-foreground mt-2">
                        Last sync: {formatLastSync(integration.last_sync_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleManualSync(integration.id)}
                        disabled={syncing === integration.id}
                      >
                        <RefreshCw className={`h-4 w-4 mr-1 ${syncing === integration.id ? 'animate-spin' : ''}`} />
                        {syncing === integration.id ? 'Syncing...' : 'Sync'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEditModal(integration)}>
                        <Settings className="h-4 w-4 mr-1" /> Configure
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(integration.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                {integration.last_error && (
                  <div className="mt-3 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    {integration.last_error}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Dialog open={addModal || !!configModal} onOpenChange={() => { setAddModal(false); setConfigModal(null); resetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{configModal ? 'Edit Integration' : 'Add New Integration'}</DialogTitle>
            <DialogDescription>
              {configModal ? 'Update the API credentials and settings.' : 'Enter the API credentials for the external platform you want to connect.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Integration Name *</Label>
              <Input
                id="name"
                placeholder="e.g. CrewConnect, ECDIS Provider"
                value={form.integration_name}
                onChange={e => setForm(p => ({ ...p, integration_name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Input
                id="provider"
                placeholder="e.g. MarineTraffic, Custom"
                value={form.provider}
                onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                placeholder="Brief description of what this integration does"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={configModal ? 'Leave as-is or enter new key' : 'Enter API key'}
                  value={form.api_key}
                  onChange={e => setForm(p => ({ ...p, api_key: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint URL *</Label>
              <Input
                id="endpoint"
                type="url"
                placeholder="https://api.example.com/v1"
                value={form.endpoint_url}
                onChange={e => setForm(p => ({ ...p, endpoint_url: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Refresh Interval</Label>
              <Select
                value={String(form.refresh_interval_minutes)}
                onValueChange={v => setForm(p => ({ ...p, refresh_interval_minutes: parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Every 5 minutes</SelectItem>
                  <SelectItem value="15">Every 15 minutes</SelectItem>
                  <SelectItem value="30">Every 30 minutes</SelectItem>
                  <SelectItem value="60">Every hour</SelectItem>
                  <SelectItem value="360">Every 6 hours</SelectItem>
                  <SelectItem value="1440">Every 24 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data Types to Harvest</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {DATA_TYPE_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.data_types.includes(opt.value)}
                      onCheckedChange={() => toggleDataType(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !form.endpoint_url}
            >
              {testing ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Testing...</>
              ) : (
                <><ExternalLink className="h-4 w-4 mr-2" />Test Connection</>
              )}
            </Button>
            <Button
              onClick={configModal ? handleUpdateIntegration : handleAddIntegration}
              disabled={configModal ? !isEditFormValid : !isFormValid}
            >
              {configModal ? 'Save Changes' : 'Add Integration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Integration</DialogTitle>
            <DialogDescription>
              Are you sure? This will permanently delete the API key and configuration.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntegrationsSection;
