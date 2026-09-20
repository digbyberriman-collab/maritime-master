import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { PersonChip } from '@/modules/legal/components/PersonChip';
import { PriorityBadge, RiskBadge, SlaBadge, StatusBadge } from '@/modules/legal/components/badges';
import { StatusStepper } from '@/modules/legal/components/requests/StatusStepper';
import { RequestSummary } from '@/modules/legal/components/requests/RequestSummary';
import { TeamControls, type TeamChange } from '@/modules/legal/components/requests/TeamControls';
import { CommentThread } from '@/modules/legal/components/requests/CommentThread';
import { AttachmentList } from '@/modules/legal/components/requests/AttachmentList';
import { EventTimeline } from '@/modules/legal/components/requests/EventTimeline';
import { useLegalRequest, useLegalRequests } from '@/modules/legal/hooks/useLegalRequests';
import { useLegalComments, useLegalRequestEvents } from '@/modules/legal/hooks/useLegalComments';
import { requestTypeLabel } from '@/modules/legal/lib/constants';
import { isOpen } from '@/modules/legal/lib/requests';
import { errorMessage } from '@/modules/legal/lib/storage';
import { LEGAL_PATHS } from '@/modules/legal/paths';

const LegalRequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const access = useLegalAccess();
  const request = useLegalRequest(id);
  const { updateRequest, deleteRequest } = useLegalRequests({ enabled: false });
  const comments = useLegalComments(id);
  const events = useLegalRequestEvents(id);

  const row = request.data;
  const isOwner = Boolean(row && user && row.submitted_by === user.id);
  const canManage = !access.loading && access.canEdit;
  const open = row ? isOpen(row.status) : false;
  const canCancel = isOwner && row && (row.status === 'submitted' || row.status === 'triaged');

  const applyTeamChange = async ({ patch, log }: TeamChange) => {
    if (!row) return;
    await updateRequest.mutateAsync({ id: row.id, patch, silent: Boolean(log) });
    if (log) await comments.addComment.mutateAsync({ content: log.content, comment_type: log.comment_type, metadata: log.metadata });
  };

  const cancel = async () => {
    if (!row) return;
    await updateRequest.mutateAsync({ id: row.id, patch: { status: 'cancelled' }, silent: true });
    await comments.addComment.mutateAsync({ content: 'Request cancelled by the requester', comment_type: 'comment' }).catch(() => undefined);
  };

  const remove = async () => {
    if (!row) return;
    await deleteRequest.mutateAsync(row.id);
    navigate(LEGAL_PATHS.requests);
  };

  if (request.isLoading) {
    return (
      <LegalShell title="Loading request" backTo={{ label: 'Back to requests', path: LEGAL_PATHS.requests }}>
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </LegalShell>
    );
  }

  if (request.error || !row) {
    return (
      <LegalShell title="Request not found" backTo={{ label: 'Back to requests', path: LEGAL_PATHS.requests }}>
        <Alert variant="destructive">
          <AlertTitle>Could not open this request</AlertTitle>
          <AlertDescription>{request.error ? errorMessage(request.error) : 'It may have been deleted, or you do not have access to it.'}</AlertDescription>
        </Alert>
      </LegalShell>
    );
  }

  return (
    <LegalShell
      title={row.title}
      description={`${row.reference_number ?? ''} · ${requestTypeLabel(row.request_type)}`}
      backTo={{ label: 'Back to requests', path: LEGAL_PATHS.requests }}
      actions={
        <>
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={updateRequest.isPending}>
                  <XCircle className="mr-2 h-4 w-4" /> Cancel request
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
                  <AlertDialogDescription>The legal team will stop work on it. You can raise a new request at any time.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it open</AlertDialogCancel>
                  <AlertDialogAction onClick={cancel}>Cancel request</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canManage && access.canAdmin && (
            <AlertDialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete request
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {row.reference_number}?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently removes the request, its thread, attachments index and audit trail. Cancelling is usually the better option.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep</AlertDialogCancel>
                  <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </>
      }
    >
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={row.status} />
            <PriorityBadge priority={row.priority} showSla />
            <RiskBadge risk={row.risk_level} />
            <SlaBadge row={row} />
            <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              Assigned to <PersonChip userId={row.assigned_to} />
            </span>
          </div>
          <StatusStepper status={row.status} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <RequestSummary request={row} />
          <CommentThread
            comments={comments.comments}
            isLoading={comments.isLoading}
            canPost={(isOwner || canManage) && open}
            canPostInternal={canManage}
            onPost={(content, type) => comments.addComment.mutateAsync({ content, comment_type: type })}
            isPosting={comments.addComment.isPending}
          />
        </div>
        <div className="space-y-4">
          {canManage && <TeamControls request={row} onChange={applyTeamChange} isPending={updateRequest.isPending || comments.addComment.isPending} />}
          <AttachmentList request={row} canEdit={(isOwner || canManage) && open} />
          <EventTimeline events={events.events} isLoading={events.isLoading} />
        </div>
      </div>
    </LegalShell>
  );
};

export default LegalRequestDetailPage;
