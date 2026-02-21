import React, { useState, useEffect } from 'react';
import { Eye, Plus, Copy, RefreshCw, Shield, Calendar, Users, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { cn } from '@/lib/utils';
import SettingsCard from '../common/SettingsCard';

interface Vessel {
  id: string;
  name: string;
  imo_number: string | null;
}

interface AuditSession {
  id: string;
  vessel_id: string;
  audit_party: string;
  audit_party_name: string | null;
  start_datetime: string;
  end_datetime: string;
  visible_modules: Record<string, boolean>;
  redaction_rules: Record<string, boolean>;
  access_token: string | null;
  is_active: boolean;
  created_at: string;
  vessel?: { name: string };
  creator?: { first_name: string; last_name: string };
}

interface AuditModeConfig {
  vessel_id: string;
  audit_party: 'flag' | 'class' | 'internal' | 'external';
  audit_party_name: string;
  start_datetime: string;
  end_datetime: string;
  visible_modules: {
    certificates: boolean;
    crew: boolean;
    incidents: boolean;
    drills: boolean;
    training: boolean;
    maintenance: boolean;
    documents: boolean;
  };
  redaction_rules: {
    hide_overdue: boolean;
    anonymize_medical: boolean;
    hide_maintenance_details: boolean;
    show_summary_only: boolean;
  };
}

const DEFAULT_CONFIG: AuditModeConfig = {
  vessel_id: '',
  audit_party: 'flag',
  audit_party_name: '',
  start_datetime: '',
  end_datetime: '',
  visible_modules: {
    certificates: true,
    crew: true,
    incidents: true,
    drills: true,
    training: true,
    maintenance: false,
    documents: true,
  },
  redaction_rules: {
    hide_overdue: false,
    anonymize_medical: true,
    hide_maintenance_details: true,
    show_summary_only: false,
  },
};

const VISIBLE_MODULES = [
  { key: 'certificates', label: 'Certificates' },
  { key: 'crew', label: 'Crew List' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'drills', label: 'Drills' },
  { key: 'training', label: 'Training' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'documents', label: 'Documents' },
];

const AuditModeSection: React.FC = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [config, setConfig] = useState<AuditModeConfig>(DEFAULT_CONFIG);

  const userRole = profile?.role || '';
  const hasAccess = ['dpa', 'shore_management', 'master'].includes(userRole);
  const isCaptain = userRole === 'master';

  useEffect(() => {
    if (user?.id && profile?.company_id) {
      loadData();
    }
  }, [user?.id, profile?.company_id]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadAuditSessions(), loadVessels()]);
    setLoading(false);
  };

  const loadAuditSessions = async () => {
    if (!profile?.company_id) return;

    try {
      let query = (supabase as any)
        .from('audit_mode_sessions')
        .select(`
          *,
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      // Captain can only see their vessel's sessions
      if (isCaptain) {
        const { data: captainVessels } = await supabase
          .from('crew_assignments')
          .select('vessel_id')
          .eq('user_id', user!.id)
          .eq('is_current', true);

        const vesselIds = captainVessels?.map(v => v.vessel_id) || [];
        if (vesselIds.length > 0) {
          query = query.in('vessel_id', vesselIds);
        } else {
          setSessions([]);
          return;
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading audit sessions:', error);
    }
  };

  const loadVessels = async () => {
    if (!profile?.company_id) return;

    try {
      let query = supabase
        .from('vessels')
        .select('id, name, imo_number')
        .eq('company_id', profile.company_id)
        .eq('status', 'ACTIVE')
        .order('name');

      // Captain can only see their vessel(s)
      if (isCaptain) {
        const { data: captainVessels } = await supabase
          .from('crew_assignments')
          .select('vessel_id')
          .eq('user_id', user!.id)
          .eq('is_current', true);

        const vesselIds = captainVessels?.map(v => v.vessel_id) || [];
        if (vesselIds.length > 0) {
          query = query.in('id', vesselIds);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setVessels(data || []);
    } catch (error) {
      console.error('Error loading vessels:', error);
    }
  };

  const createAuditSession = async () => {
    if (!config.vessel_id) {
      toast({ title: 'Error', description: 'Please select a vessel.', variant: 'destructive' });
      return;
    }

    if (!config.start_datetime || !config.end_datetime) {
      toast({ title: 'Error', description: 'Start and end dates are required.', variant: 'destructive' });
      return;
    }

    if (new Date(config.end_datetime) <= new Date(config.start_datetime)) {
      toast({ title: 'Error', description: 'End date must be after start date.', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const accessToken = crypto.randomUUID();
      const tokenExpiry = new Date(config.end_datetime);

      const { data, error } = await (supabase as any)
        .from('audit_mode_sessions')
        .insert({
          company_id: profile?.company_id,
          vessel_id: config.vessel_id,
          audit_party: config.audit_party,
          audit_party_name: config.audit_party_name || null,
          start_datetime: config.start_datetime,
          end_datetime: config.end_datetime,
          visible_modules: config.visible_modules,
          redaction_rules: {
            ...config.redaction_rules,
            anonymize_medical: true, // Always enforce
          },
          access_token: accessToken,
          access_token_expires_at: tokenExpiry.toISOString(),
          is_active: true,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Log audit
      await (supabase as any).from('audit_logs').insert({
        entity_type: 'audit_mode_session',
        entity_id: data.id,
        action: 'CREATE',
        actor_user_id: user?.id,
        actor_email: profile?.email,
        actor_role: profile?.role,
        new_values: config,
      });

      toast({ title: 'Success', description: 'Audit mode session created.' });
      setShowCreateForm(false);
      setConfig(DEFAULT_CONFIG);
      loadAuditSessions();
    } catch (error: any) {
      console.error('Error creating audit session:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create session.', 
        variant: 'destructive' 
      });
    } finally {
      setSaving(false);
    }
  };

  const deactivateSession = async (sessionId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('audit_mode_sessions')
        .update({ is_active: false, access_token: null })
        .eq('id', sessionId);

      if (error) throw error;

      await (supabase as any).from('audit_logs').insert({
        entity_type: 'audit_mode_session',
        entity_id: sessionId,
        action: 'DEACTIVATE',
        actor_user_id: user?.id,
        actor_email: profile?.email,
        actor_role: profile?.role,
      });

      toast({ title: 'Success', description: 'Audit session deactivated.' });
      loadAuditSessions();
    } catch (error) {
      console.error('Error deactivating session:', error);
      toast({ title: 'Error', description: 'Failed to deactivate session.', variant: 'destructive' });
    }
  };

  const regenerateToken = async (sessionId: string) => {
    try {
      const newToken = crypto.randomUUID();

      const { error } = await (supabase as any)
        .from('audit_mode_sessions')
        .update({ access_token: newToken })
        .eq('id', sessionId);

      if (error) throw error;

      await (supabase as any).from('audit_logs').insert({
        entity_type: 'audit_mode_session',
        entity_id: sessionId,
        action: 'REGENERATE_TOKEN',
        actor_user_id: user?.id,
        actor_email: profile?.email,
        actor_role: profile?.role,
      });

      toast({ title: 'Success', description: 'New access token generated.' });
      loadAuditSessions();
    } catch (error) {
      console.error('Error regenerating token:', error);
      toast({ title: 'Error', description: 'Failed to regenerate token.', variant: 'destructive' });
    }
  };

  const copyAccessLink = (token: string) => {
    const link = `${window.location.origin}/audit/${token}`;
    navigator.clipboard.writeText(link);
    toast({ title: 'Copied', description: 'Access link copied to clipboard.' });
  };

  const formatAuditParty = (party: string) => {
    const labels: Record<string, string> = {
      flag: 'Flag State',
      class: 'Classification Society',
      internal: 'Internal Audit',
      external: 'External Audit',
    };
    return labels[party] || party;
  };

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Audit Visibility</h2>
          <p className="text-muted-foreground mt-1">Configure auditor access settings</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to access this section.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Audit Visibility</h2>
          <p className="text-muted-foreground mt-1">Configure auditor access settings</p>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Audit Visibility</h2>
        <p className="text-muted-foreground mt-1">
          Configure what auditors can see during inspections
        </p>
      </div>

      {/* Active Sessions */}
      <SettingsCard
        title="Audit Mode Sessions"
        description="Manage auditor access to your fleet data"
        headerAction={
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Session
          </Button>
        }
      >
        {sessions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No audit sessions configured</p>
            <p className="text-sm mt-1">Create a session to grant auditor access</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'p-4 border rounded-lg',
                  session.is_active ? 'border-primary/30 bg-primary/5' : 'border-muted bg-muted/30'
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{session.vessel?.name || 'Unknown Vessel'}</span>
                      <Badge variant={session.is_active ? 'default' : 'secondary'}>
                        {session.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatAuditParty(session.audit_party)}
                      {session.audit_party_name && ` — ${session.audit_party_name}`}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(session.start_datetime).toLocaleDateString()} - {new Date(session.end_datetime).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {session.is_active && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => session.access_token && copyAccessLink(session.access_token)}
                        disabled={!session.access_token}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => regenerateToken(session.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deactivateSession(session.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        Deactivate
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {/* Create Session Form */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Audit Session</DialogTitle>
            <DialogDescription>
              Configure access settings for auditors
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vessel_id">Vessel *</Label>
                <Select
                  value={config.vessel_id}
                  onValueChange={(value) => setConfig({ ...config, vessel_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vessel" />
                  </SelectTrigger>
                  <SelectContent>
                    {vessels.map((vessel) => (
                      <SelectItem key={vessel.id} value={vessel.id}>
                        {vessel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="audit_party">Audit Party *</Label>
                <Select
                  value={config.audit_party}
                  onValueChange={(value: any) => setConfig({ ...config, audit_party: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flag">Flag State</SelectItem>
                    <SelectItem value="class">Classification Society</SelectItem>
                    <SelectItem value="internal">Internal Audit</SelectItem>
                    <SelectItem value="external">External Audit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="audit_party_name">Auditor/Organization Name</Label>
                <Input
                  id="audit_party_name"
                  value={config.audit_party_name}
                  onChange={(e) => setConfig({ ...config, audit_party_name: e.target.value })}
                  placeholder="e.g., Lloyd's Register"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_datetime">Start Date & Time *</Label>
                <Input
                  id="start_datetime"
                  type="datetime-local"
                  value={config.start_datetime}
                  onChange={(e) => setConfig({ ...config, start_datetime: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_datetime">End Date & Time *</Label>
                <Input
                  id="end_datetime"
                  type="datetime-local"
                  value={config.end_datetime}
                  onChange={(e) => setConfig({ ...config, end_datetime: e.target.value })}
                />
              </div>
            </div>

            {/* Visible Modules */}
            <div>
              <h4 className="font-medium mb-3">Visible Modules</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {VISIBLE_MODULES.map((mod) => (
                  <div
                    key={mod.key}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <span className="text-sm">{mod.label}</span>
                    <Switch
                      checked={config.visible_modules[mod.key as keyof typeof config.visible_modules]}
                      onCheckedChange={(checked) =>
                        setConfig({
                          ...config,
                          visible_modules: {
                            ...config.visible_modules,
                            [mod.key]: checked,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Redaction Rules */}
            <div>
              <h4 className="font-medium mb-3">Redaction Rules</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">Hide overdue counts</span>
                  <Switch
                    checked={config.redaction_rules.hide_overdue}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        redaction_rules: { ...config.redaction_rules, hide_overdue: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm">Anonymize medical records</span>
                    <p className="text-xs text-muted-foreground">
                      Always enforced for privacy compliance
                    </p>
                  </div>
                  <Switch checked={true} disabled />
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">Hide maintenance details (show KPIs only)</span>
                  <Switch
                    checked={config.redaction_rules.hide_maintenance_details}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        redaction_rules: {
                          ...config.redaction_rules,
                          hide_maintenance_details: checked,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm">Show summary only (no individual records)</span>
                  <Switch
                    checked={config.redaction_rules.show_summary_only}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        redaction_rules: { ...config.redaction_rules, show_summary_only: checked },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateForm(false)}>
              Cancel
            </Button>
            <Button onClick={createAuditSession} disabled={saving}>
              {saving ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Access Link Info */}
      {sessions.filter((s) => s.is_active).length > 0 && (
        <SettingsCard
          title="Auditor Access Link"
          description="Share this link with auditors. Access is logged and time-limited."
        >
          {sessions
            .filter((s) => s.is_active && s.access_token)
            .slice(0, 1)
            .map((session) => (
              <div key={session.id} className="flex gap-2">
                <Input
                  value={`${window.location.origin}/audit/${session.access_token}`}
                  readOnly
                  className="flex-1 bg-muted text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => session.access_token && copyAccessLink(session.access_token)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button onClick={() => regenerateToken(session.id)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
              </div>
            ))}
        </SettingsCard>
      )}
    </div>
  );
};

export default AuditModeSection;
