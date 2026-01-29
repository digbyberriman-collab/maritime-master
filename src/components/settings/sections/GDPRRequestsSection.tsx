import React from 'react';
import { useGDPRRequests } from '@/hooks/useGDPRRequests';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Shield, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  FileText,
  Download,
  UserX,
  Edit,
  Eye
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

const REQUEST_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  access: { label: 'Data Access', icon: <Eye className="w-4 h-4" /> },
  rectification: { label: 'Rectification', icon: <Edit className="w-4 h-4" /> },
  erasure: { label: 'Erasure', icon: <UserX className="w-4 h-4" /> },
  portability: { label: 'Portability', icon: <Download className="w-4 h-4" /> },
  restriction: { label: 'Restriction', icon: <Shield className="w-4 h-4" /> },
  objection: { label: 'Objection', icon: <AlertTriangle className="w-4 h-4" /> },
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'destructive',
  in_progress: 'default',
  completed: 'secondary',
  rejected: 'outline',
};

export const GDPRRequestsSection: React.FC = () => {
  const { 
    gdprRequests, 
    isLoading, 
    pendingCount,
    overdueRequests,
    processRequest 
  } = useGDPRRequests();

  if (isLoading) {
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
      <div>
        <h2 className="text-2xl font-semibold text-foreground">GDPR Data Subject Requests</h2>
        <p className="text-muted-foreground mt-1">
          Manage data access, rectification, erasure, and portability requests from crew members.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{gdprRequests?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={pendingCount > 0 ? 'border-warning' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${pendingCount > 0 ? 'bg-warning/10' : 'bg-muted'}`}>
                <Clock className={`w-5 h-5 ${pendingCount > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={overdueRequests.length > 0 ? 'border-destructive' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${overdueRequests.length > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                <AlertTriangle className={`w-5 h-5 ${overdueRequests.length > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{overdueRequests.length}</p>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Alert */}
      {overdueRequests.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Overdue Requests Require Immediate Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {overdueRequests.length} request(s) have exceeded the 30-day GDPR deadline. 
              Failure to respond may result in regulatory penalties.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Request List */}
      <Card>
        <CardHeader>
          <CardTitle>All Requests</CardTitle>
          <CardDescription>
            Data subject requests from crew members
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gdprRequests && gdprRequests.length > 0 ? (
            <div className="space-y-3">
              {gdprRequests.map((request) => {
                const typeInfo = REQUEST_TYPE_LABELS[request.request_type];
                const isOverdue = request.status !== 'completed' && 
                  request.status !== 'rejected' && 
                  new Date(request.deadline_date) < new Date();
                
                return (
                  <div 
                    key={request.id} 
                    className={`p-4 rounded-lg border ${isOverdue ? 'border-destructive bg-destructive/5' : 'bg-muted/50'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {typeInfo?.icon}
                          <span className="font-medium">{typeInfo?.label || request.request_type}</span>
                          <Badge variant={STATUS_VARIANTS[request.status] || 'outline'}>
                            {request.status}
                          </Badge>
                          {isOverdue && (
                            <Badge variant="destructive">Overdue</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Requested {formatDistanceToNow(new Date(request.requested_at), { addSuffix: true })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Deadline: {format(new Date(request.deadline_date), 'PPP')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {request.status === 'pending' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => processRequest.mutate({
                                requestId: request.id,
                                status: 'in_progress',
                              })}
                            >
                              Start Processing
                            </Button>
                          </>
                        )}
                        {request.status === 'in_progress' && (
                          <Button 
                            size="sm"
                            onClick={() => processRequest.mutate({
                              requestId: request.id,
                              status: 'completed',
                            })}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Complete
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No GDPR requests have been submitted.
            </p>
          )}
        </CardContent>
      </Card>

      {/* GDPR Compliance Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            GDPR Response Requirements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded bg-muted/50">
              <Clock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">30-Day Response Deadline</h4>
                <p className="text-sm text-muted-foreground">
                  All requests must be responded to within 30 calendar days. 
                  Extensions of up to 2 months may be requested for complex cases.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded bg-muted/50">
              <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Documentation Required</h4>
                <p className="text-sm text-muted-foreground">
                  Maintain records of all requests, responses, and actions taken. 
                  This log serves as evidence of compliance.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded bg-muted/50">
              <Download className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Data Export Format</h4>
                <p className="text-sm text-muted-foreground">
                  For portability requests, data must be provided in a structured, 
                  commonly used, machine-readable format (e.g., JSON, CSV).
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GDPRRequestsSection;
