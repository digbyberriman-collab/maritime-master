import React, { useState } from 'react';
import { useInsuranceAuditMode } from '@/hooks/useInsuranceAuditMode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
  Shield, 
  Plus, 
  Clock, 
  Eye, 
  EyeOff,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { INSURANCE_FIELD_ACCESS_LEVELS } from '@/lib/compliance/types';

export const InsuranceAuditModeSection: React.FC = () => {
  const { 
    auditSessions, 
    activeSession, 
    sessionsLoading,
    createAuditSession,
    revokeAuditSession 
  } = useInsuranceAuditMode();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    audit_party: '',
    auditor_name: '',
    auditor_email: '',
    start_datetime: '',
    end_datetime: '',
  });

  const handleCreateSession = () => {
    createAuditSession.mutate(newSession, {
      onSuccess: () => {
        setIsCreateDialogOpen(false);
        setNewSession({
          audit_party: '',
          auditor_name: '',
          auditor_email: '',
          start_datetime: '',
          end_datetime: '',
        });
      },
    });
  };

  if (sessionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Insurance Audit Mode</h2>
          <p className="text-muted-foreground mt-1">
            Create time-bound, read-only access sessions for external auditors.
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Audit Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Insurance Audit Session</DialogTitle>
              <DialogDescription>
                Create a time-limited access session for an external auditor.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="audit_party">Audit Party</Label>
                <Input
                  id="audit_party"
                  placeholder="e.g., Flag State, Classification Society"
                  value={newSession.audit_party}
                  onChange={(e) => setNewSession({ ...newSession, audit_party: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auditor_name">Auditor Name</Label>
                <Input
                  id="auditor_name"
                  placeholder="Full name"
                  value={newSession.auditor_name}
                  onChange={(e) => setNewSession({ ...newSession, auditor_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auditor_email">Auditor Email</Label>
                <Input
                  id="auditor_email"
                  type="email"
                  placeholder="auditor@example.com"
                  value={newSession.auditor_email}
                  onChange={(e) => setNewSession({ ...newSession, auditor_email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_datetime">Start Date/Time</Label>
                  <Input
                    id="start_datetime"
                    type="datetime-local"
                    value={newSession.start_datetime}
                    onChange={(e) => setNewSession({ ...newSession, start_datetime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_datetime">End Date/Time</Label>
                  <Input
                    id="end_datetime"
                    type="datetime-local"
                    value={newSession.end_datetime}
                    onChange={(e) => setNewSession({ ...newSession, end_datetime: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateSession}
                disabled={!newSession.audit_party || !newSession.start_datetime || !newSession.end_datetime}
              >
                Create Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Session Alert */}
      {activeSession && (
        <Card className="border-primary bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-primary">
              <Shield className="w-5 h-5" />
              Active Audit Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{activeSession.audit_party}</p>
                <p className="text-sm text-muted-foreground">
                  {activeSession.auditor_name} • Expires {formatDistanceToNow(new Date(activeSession.end_datetime), { addSuffix: true })}
                </p>
              </div>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => revokeAuditSession.mutate(activeSession.id)}
              >
                Revoke Access
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Field Access Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Auditor Field Access
          </CardTitle>
          <CardDescription>
            What auditors can and cannot see in Insurance Audit Mode
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Visible Fields */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                Visible to Auditors
              </h4>
              <ul className="space-y-2">
                {INSURANCE_FIELD_ACCESS_LEVELS.auditor_visible.map((field) => (
                  <li key={field} className="text-sm flex items-center gap-2">
                    <Eye className="w-3 h-3 text-green-600" />
                    {field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </li>
                ))}
              </ul>
            </div>

            {/* Hidden Fields */}
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2 text-destructive">
                <XCircle className="w-4 h-4" />
                Hidden from Auditors
              </h4>
              <ul className="space-y-2">
                {INSURANCE_FIELD_ACCESS_LEVELS.auditor_hidden.map((field) => (
                  <li key={field} className="text-sm flex items-center gap-2">
                    <EyeOff className="w-3 h-3 text-destructive" />
                    {field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Audit Session History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditSessions && auditSessions.length > 0 ? (
            <div className="space-y-3">
              {auditSessions.map((session) => {
                const isActive = session.is_active && 
                  new Date() >= new Date(session.start_datetime) && 
                  new Date() <= new Date(session.end_datetime);
                const isPast = new Date() > new Date(session.end_datetime);
                
                return (
                  <div 
                    key={session.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{session.audit_party}</span>
                        {isActive && (
                          <Badge variant="default" className="bg-green-600">Active</Badge>
                        )}
                        {isPast && (
                          <Badge variant="secondary">Expired</Badge>
                        )}
                        {!session.is_active && !isPast && (
                          <Badge variant="destructive">Revoked</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {session.auditor_name || 'Unknown Auditor'} • {format(new Date(session.start_datetime), 'PPp')} - {format(new Date(session.end_datetime), 'PPp')}
                      </p>
                    </div>
                    {isActive && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => revokeAuditSession.mutate(session.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              No audit sessions created yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Security Notice */}
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <div>
              <h4 className="font-medium">Security Notice</h4>
              <p className="text-sm text-muted-foreground mt-1">
                All access during audit sessions is logged. Auditors can only view approved fields and cannot modify any data. 
                Sessions automatically expire at the specified end time.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InsuranceAuditModeSection;
