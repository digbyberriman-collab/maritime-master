import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { usePendingReviews, useDocumentWorkflowMutations } from '@/modules/documents/hooks/useDocumentWorkflow';
import { useDocument } from '@/modules/documents/hooks/useDocuments';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Check,
  X,
  Eye,
  Clock,
  User,
  Calendar,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

const ReviewQueue: React.FC = () => {
  const { data: pendingReviews = [], isLoading } = usePendingReviews();
  const { approveDocument, rejectDocument } = useDocumentWorkflowMutations();

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [actionDocumentId, setActionDocumentId] = useState<string | null>(null);

  const { data: previewDocument } = useDocument(selectedDocumentId);

  const handlePreview = (documentId: string) => {
    setSelectedDocumentId(documentId);
    setPreviewOpen(true);
  };

  const handleApprove = async (documentId: string) => {
    await approveDocument.mutateAsync({ documentId });
  };

  const handleOpenReject = (documentId: string) => {
    setActionDocumentId(documentId);
    setRejectFeedback('');
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!actionDocumentId || !rejectFeedback.trim()) return;
    await rejectDocument.mutateAsync({
      documentId: actionDocumentId,
      feedback: rejectFeedback,
    });
    setRejectOpen(false);
    setActionDocumentId(null);
    setRejectFeedback('');
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
          <p className="text-muted-foreground">
            Documents awaiting your review and approval
          </p>
        </div>

        {/* Pending Reviews */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : pendingReviews.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                All caught up!
              </h3>
              <p className="text-muted-foreground">
                You have no documents pending review.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingReviews.map((review) => (
              <Card key={review.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{review.title}</CardTitle>
                        <CardDescription>{review.document_number}</CardDescription>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending Review
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      <span>
                        {review.author
                          ? `${review.author.first_name} ${review.author.last_name}`
                          : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{format(new Date(review.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreview(review.id)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleApprove(review.id)}
                      disabled={approveDocument.isPending}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleOpenReject(review.id)}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Request Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewDocument?.title || 'Document Preview'}</DialogTitle>
            <DialogDescription>
              {previewDocument?.document_number} · {previewDocument?.revision}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-4">
              {previewDocument?.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="mt-1">{previewDocument.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Category</Label>
                  <p className="mt-1">{previewDocument?.category?.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Language</Label>
                  <p className="mt-1">{previewDocument?.language}</p>
                </div>
              </div>
              {previewDocument?.file_url && (
                <div>
                  <Label className="text-muted-foreground">File</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => window.open(previewDocument.file_url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Document
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setPreviewOpen(false);
                if (selectedDocumentId) handleApprove(selectedDocumentId);
              }}
              disabled={approveDocument.isPending}
            >
              <Check className="w-4 h-4 mr-2" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Request Changes
            </DialogTitle>
            <DialogDescription>
              Provide feedback to the author about what needs to be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Feedback *</Label>
            <Textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="Describe what changes are needed..."
              rows={4}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectFeedback.trim() || rejectDocument.isPending}
            >
              Request Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ReviewQueue;
