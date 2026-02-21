import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  FileText,
  Clock,
  AlertTriangle,
  Play,
  Trash2,
  Loader2,
  Ship,
} from 'lucide-react';
import { useMyDraftSubmissions, useDeleteSubmission } from '@/modules/ism/forms/hooks/useFormSubmissions';
import { formatDistanceToNow, differenceInDays } from 'date-fns';

const MyDrafts: React.FC = () => {
  const navigate = useNavigate();
  const { data: drafts = [], isLoading } = useMyDraftSubmissions();
  const deleteMutation = useDeleteSubmission();

  const handleDelete = async (submissionId: string) => {
    await deleteMutation.mutateAsync(submissionId);
  };

  const getDraftAge = (createdAt: string) => {
    return differenceInDays(new Date(), new Date(createdAt));
  };

  const isStale = (createdAt: string) => {
    return getDraftAge(createdAt) > 7;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Drafts</h1>
            <p className="text-muted-foreground">Continue working on your incomplete form submissions</p>
          </div>
          <Button onClick={() => navigate('/ism/forms/templates')}>
            Start New Form
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : drafts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Drafts</h3>
              <p className="text-muted-foreground text-sm mt-1">
                You don't have any incomplete forms. Start a new one to get going.
              </p>
              <Button className="mt-4" onClick={() => navigate('/ism/forms/templates')}>
                Browse Templates
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map(draft => {
              const age = getDraftAge(draft.created_at);
              const stale = isStale(draft.created_at);

              return (
                <Card 
                  key={draft.id} 
                  className={`hover:shadow-md transition-shadow ${stale ? 'border-warning' : ''}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{draft.template?.template_name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5 font-mono">
                          {draft.submission_number}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Draft
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {draft.vessel && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Ship className="h-4 w-4" />
                        {draft.vessel.name}
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm">
                      {stale ? (
                        <div className="flex items-center gap-1 text-warning">
                          <AlertTriangle className="h-4 w-4" />
                          <span>{age} days old - consider completing or deleting</span>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          Started {formatDistanceToNow(new Date(draft.created_at), { addSuffix: true })}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Button 
                        className="flex-1"
                        onClick={() => navigate(`/ism/forms/submission/${draft.id}`)}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Continue
                      </Button>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Draft?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete this draft submission. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(draft.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default MyDrafts;
