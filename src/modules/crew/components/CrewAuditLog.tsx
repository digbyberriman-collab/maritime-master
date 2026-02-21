import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { hasPermission, Permission } from '@/modules/auth/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectTrigger, 
  SelectValue, 
  SelectContent, 
  SelectItem 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  User, 
  Edit, 
  Trash2, 
  Plus,
  FileText,
  Shield,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  changed_fields: Record<string, boolean> | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string | null;
}

interface CrewAuditLogProps {
  crewId: string;
}

export const CrewAuditLog: React.FC<CrewAuditLogProps> = ({ crewId }) => {
  const { profile } = useAuth();
  const [filters, setFilters] = useState({
    action: '',
    entity_type: '',
    startDate: '',
    endDate: ''
  });
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const canViewAuditLog = hasPermission(profile?.role, Permission.VIEW_AUDIT_LOG);

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['crew-audit-logs', crewId, filters],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_id', crewId)
        .order('timestamp', { ascending: false });

      if (filters.action) {
        query = query.eq('action', filters.action);
      }
      if (filters.entity_type) {
        query = query.eq('entity_type', filters.entity_type);
      }
      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate + 'T23:59:59');
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return (data || []) as AuditLogEntry[];
    },
    enabled: !!crewId && canViewAuditLog,
  });

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATE':
        return <Plus className="w-4 h-4 text-green-600" />;
      case 'UPDATE':
        return <Edit className="w-4 h-4 text-blue-600" />;
      case 'DELETE':
        return <Trash2 className="w-4 h-4 text-red-600" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return <Badge className="bg-green-100 text-green-800">Created</Badge>;
      case 'UPDATE':
        return <Badge className="bg-blue-100 text-blue-800">Updated</Badge>;
      case 'DELETE':
        return <Badge className="bg-red-100 text-red-800">Deleted</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const getEntityTypeBadge = (entityType: string) => {
    const types: Record<string, { label: string; color: string }> = {
      crew_profile: { label: 'Profile', color: 'bg-purple-100 text-purple-800' },
      crew_certificate: { label: 'Certificate', color: 'bg-orange-100 text-orange-800' },
      crew_attachment: { label: 'Attachment', color: 'bg-cyan-100 text-cyan-800' }
    };

    const type = types[entityType] || { label: entityType, color: 'bg-muted text-muted-foreground' };
    return <Badge className={type.color}>{type.label}</Badge>;
  };

  const formatFieldName = (field: string): string => {
    return field
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatFieldValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const handleExport = () => {
    if (!auditLogs) return;

    const csv = [
      ['Timestamp', 'Action', 'Entity Type', 'Actor', 'Role', 'Changed Fields', 'IP Address'],
      ...auditLogs.map(log => [
        log.timestamp ? new Date(log.timestamp).toISOString() : '',
        log.action,
        log.entity_type,
        log.actor_email || '',
        log.actor_role || '',
        Object.keys(log.changed_fields || {}).join('; '),
        log.ip_address || ''
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crew_audit_log_${crewId}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const applyFilters = () => {
    // Filters are applied reactively via the query
  };

  const clearFilters = () => {
    setFilters({
      action: '',
      entity_type: '',
      startDate: '',
      endDate: ''
    });
  };

  if (!canViewAuditLog) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h4 className="text-lg font-medium mb-2">Access Restricted</h4>
        <p className="text-muted-foreground">
          You don't have permission to view the audit log
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-4 text-center text-muted-foreground">Loading audit log...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Activity History</h3>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-muted/30 rounded-lg p-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Action</Label>
            <Select
              value={filters.action}
              onValueChange={(value) => setFilters({ ...filters, action: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Actions</SelectItem>
                <SelectItem value="CREATE">Created</SelectItem>
                <SelectItem value="UPDATE">Updated</SelectItem>
                <SelectItem value="DELETE">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entity Type</Label>
            <Select
              value={filters.entity_type}
              onValueChange={(value) => setFilters({ ...filters, entity_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                <SelectItem value="crew_profile">Profile</SelectItem>
                <SelectItem value="crew_certificate">Certificate</SelectItem>
                <SelectItem value="crew_attachment">Attachment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm" onClick={applyFilters}>Apply Filters</Button>
          <Button size="sm" variant="outline" onClick={clearFilters}>Clear</Button>
        </div>
      </div>

      {/* Audit Log List */}
      {(!auditLogs || auditLogs.length === 0) ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h4 className="text-lg font-medium mb-2">No Activity</h4>
          <p className="text-muted-foreground">
            No audit log entries found for this crew member
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {auditLogs.map((log) => (
            <div key={log.id} className="border rounded-lg bg-card">
              <button
                className="w-full p-4 text-left flex items-center gap-4 hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedEntry(expandedEntry === log.id ? null : log.id)}
              >
                <div className="flex-shrink-0">
                  {getActionIcon(log.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getActionBadge(log.action)}
                    {getEntityTypeBadge(log.entity_type)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span>{log.actor_email || 'Unknown'}</span>
                    <span>•</span>
                    <span>{log.actor_role || 'Unknown role'}</span>
                    <span>•</span>
                    <span>
                      {log.timestamp 
                        ? new Date(log.timestamp).toLocaleString()
                        : 'Unknown time'
                      }
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {expandedEntry === log.id ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {expandedEntry === log.id && (
                <div className="px-4 pb-4 border-t bg-muted/20">
                  <div className="pt-4 space-y-4">
                    {/* Changed Fields */}
                    {log.changed_fields && Object.keys(log.changed_fields).length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Changed Fields</h5>
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(log.changed_fields).map((field) => (
                            <Badge key={field} variant="outline" className="text-xs">
                              {formatFieldName(field)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Before/After Values */}
                    {(log.old_values || log.new_values) && (
                      <div className="grid grid-cols-2 gap-4">
                        {log.old_values && Object.keys(log.old_values).length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium mb-2 text-red-600">Before</h5>
                            <div className="bg-red-50 rounded p-3 text-sm space-y-1">
                              {Object.entries(log.old_values).map(([key, value]) => (
                                <div key={key}>
                                  <span className="font-medium">{formatFieldName(key)}:</span>{' '}
                                  <span className="text-muted-foreground">{formatFieldValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {log.new_values && Object.keys(log.new_values).length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium mb-2 text-green-600">After</h5>
                            <div className="bg-green-50 rounded p-3 text-sm space-y-1">
                              {Object.entries(log.new_values).map(([key, value]) => (
                                <div key={key}>
                                  <span className="font-medium">{formatFieldName(key)}:</span>{' '}
                                  <span className="text-muted-foreground">{formatFieldValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      {log.ip_address && <span>IP: {log.ip_address}</span>}
                      {log.user_agent && (
                        <span className="ml-4 truncate block max-w-md">
                          {log.user_agent}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
