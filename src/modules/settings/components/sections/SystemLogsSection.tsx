import React, { useState } from 'react';
import { ScrollText, Download, Filter, Search, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/shared/hooks/use-toast';
import { format } from 'date-fns';

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  actorEmail: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  details: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
}

const SAMPLE_LOGS: AuditLog[] = [
  {
    id: '1',
    timestamp: '2026-01-27T17:45:23Z',
    action: 'UPDATE',
    actorEmail: 'dpa@storm.com',
    actorRole: 'DPA',
    entityType: 'user_roles',
    entityId: 'usr_abc123',
    details: 'Updated role permissions',
    oldValues: { role: 'crew', permissions: ['view'] },
    newValues: { role: 'officer', permissions: ['view', 'edit'] }
  },
  {
    id: '2',
    timestamp: '2026-01-27T16:30:00Z',
    action: 'CREATE',
    actorEmail: 'admin@storm.com',
    actorRole: 'DPA',
    entityType: 'vessel',
    entityId: 'vsl_xyz789',
    details: 'Created new vessel: M/Y Aurora',
    newValues: { name: 'M/Y Aurora', imo: '9876543', flag: 'Cayman Islands' }
  },
  {
    id: '3',
    timestamp: '2026-01-27T15:15:00Z',
    action: 'DELETE',
    actorEmail: 'captain@storm.com',
    actorRole: 'Master',
    entityType: 'crew_assignment',
    entityId: 'asg_def456',
    details: 'Removed crew member from vessel',
    oldValues: { crew_member: 'John Smith', vessel: 'M/Y Horizon', role: 'Deckhand' }
  },
  {
    id: '4',
    timestamp: '2026-01-27T14:00:00Z',
    action: 'UPDATE',
    actorEmail: 'dpa@storm.com',
    actorRole: 'DPA',
    entityType: 'settings',
    entityId: 'compliance',
    details: 'Updated compliance settings',
    oldValues: { drill_frequency: 30 },
    newValues: { drill_frequency: 28 }
  },
  {
    id: '5',
    timestamp: '2026-01-27T12:30:00Z',
    action: 'UPDATE',
    actorEmail: 'purser@storm.com',
    actorRole: 'Purser',
    entityType: 'certificate',
    entityId: 'cert_ghi789',
    details: 'Updated certificate expiry',
    oldValues: { expiry_date: '2026-03-01' },
    newValues: { expiry_date: '2027-03-01' }
  }
];

const SystemLogsSection: React.FC = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>(SAMPLE_LOGS);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('__all__');
  const [entityFilter, setEntityFilter] = useState('__all__');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const filteredLogs = logs.filter(log => {
    if (searchQuery && !log.details.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !log.actorEmail.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (actionFilter !== '__all__' && log.action !== actionFilter) return false;
    if (entityFilter !== '__all__' && log.entityType !== entityFilter) return false;
    if (dateFrom && new Date(log.timestamp) < new Date(dateFrom)) return false;
    if (dateTo && new Date(log.timestamp) > new Date(dateTo + 'T23:59:59Z')) return false;
    return true;
  });

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Action', 'User', 'Role', 'Entity Type', 'Entity ID', 'Details'],
      ...filteredLogs.map(log => [
        log.timestamp,
        log.action,
        log.actorEmail,
        log.actorRole,
        log.entityType,
        log.entityId,
        log.details
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Export Complete',
      description: `Exported ${filteredLogs.length} log entries.`,
    });
  };

  const handleRefresh = async () => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
    toast({
      title: 'Logs Refreshed',
      description: 'Audit logs have been updated.',
    });
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Create</Badge>;
      case 'UPDATE':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Update</Badge>;
      case 'DELETE':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Delete</Badge>;
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const renderDiff = (oldValues?: Record<string, any>, newValues?: Record<string, any>) => {
    const allKeys = new Set([
      ...Object.keys(oldValues || {}),
      ...Object.keys(newValues || {})
    ]);

    return (
      <div className="bg-muted/50 rounded-lg p-4 mt-2 font-mono text-sm">
        <div className="grid grid-cols-2 gap-4">
          {oldValues && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Before</p>
              <div className="space-y-1">
                {Object.entries(oldValues).map(([key, value]) => (
                  <div key={key} className="flex">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className="ml-2 text-red-600">{JSON.stringify(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {newValues && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">After</p>
              <div className="space-y-1">
                {Object.entries(newValues).map(([key, value]) => (
                  <div key={key} className="flex">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className="ml-2 text-green-600">{JSON.stringify(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">System Logs</h2>
        <p className="text-muted-foreground mt-1">View system activity and audit logs</p>
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All actions</SelectItem>
                <SelectItem value="CREATE">Create</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
              </SelectContent>
            </Select>

            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All entities</SelectItem>
                <SelectItem value="user_roles">User Roles</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
                <SelectItem value="vessel">Vessel</SelectItem>
                <SelectItem value="crew_assignment">Crew Assignment</SelectItem>
                <SelectItem value="certificate">Certificate</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
              placeholder="To"
            />

            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          {/* Logs Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No logs found matching your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map(log => (
                    <Collapsible key={log.id} open={expandedRows.has(log.id)} onOpenChange={() => toggleRow(log.id)} asChild>
                      <>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                {expandedRows.has(log.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.timestamp), 'MMM d, HH:mm:ss')}
                          </TableCell>
                          <TableCell>{getActionBadge(log.action)}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{log.actorEmail}</p>
                              <p className="text-xs text-muted-foreground">{log.actorRole}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{log.entityType}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                            {log.details}
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/30 p-0">
                              <div className="p-4">
                                <p className="text-sm font-medium mb-2">Change Details</p>
                                {renderDiff(log.oldValues, log.newValues)}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredLogs.length} of {logs.length} entries
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemLogsSection;
