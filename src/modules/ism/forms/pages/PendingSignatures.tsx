import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PenTool,
  FileText,
  CheckCircle,
  Ship,
  User,
  Calendar,
  Loader2,
  Eye,
} from 'lucide-react';
import { usePendingSignatures, useSignSubmission } from '@/modules/ism/forms/hooks/useFormSubmissions';
import { format } from 'date-fns';

const PendingSignatures: React.FC = () => {
  const navigate = useNavigate();
  const { data: pendingSubmissions = [], isLoading } = usePendingSignatures();
  const signMutation = useSignSubmission();

  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [typedName, setTypedName] = useState('');

  const handleOpenSign = (submission: any) => {
    setSelectedSubmission(submission);
    setTypedName('');
    setSignDialogOpen(true);
  };

  const handleSign = async () => {
    if (!selectedSubmission || !typedName.trim()) return;

    await signMutation.mutateAsync({
      submissionId: selectedSubmission.id,
    });

    setSignDialogOpen(false);
    setSelectedSubmission(null);
    setTypedName('');
  };

  const getSignatureProgress = (submission: any) => {
    const signatures = submission.signatures || [];
    const requiredSigners = (submission.template?.required_signers as any[]) || [];
    const required = requiredSigners.filter((r: any) => r.is_mandatory !== false).length;
    return { collected: signatures.length, required };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pending Signatures</h1>
            <p className="text-muted-foreground">Forms awaiting your signature</p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {pendingSubmissions.length} pending
          </Badge>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : pendingSubmissions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-success mb-4" />
              <h3 className="text-lg font-medium">All Caught Up!</h3>
              <p className="text-muted-foreground text-sm mt-1">
                You don't have any forms waiting for your signature.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingSubmissions.map(submission => {
              const sigProgress = getSignatureProgress(submission);

              return (
                <Card key={submission.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">
                              {submission.template?.template_name}
                            </h3>
                            <p className="text-sm text-muted-foreground font-mono">
                              {submission.submission_number}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
                          {submission.vessel && (
                            <div className="flex items-center gap-1">
                              <Ship className="h-4 w-4" />
                              {submission.vessel.name}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {submission.creator ? [submission.creator.first_name, submission.creator.last_name].filter(Boolean).join(' ') : 'Unknown'}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(submission.submitted_at || submission.created_at), 'dd MMM yyyy HH:mm')}
                          </div>
                        </div>

                        <div className="mt-3">
                          <Badge variant="outline">
                            Signatures: {sigProgress.collected} / {sigProgress.required}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                        <Button onClick={() => handleOpenSign(submission)}>
                          <PenTool className="h-4 w-4 mr-2" />
                          Sign
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Sign Dialog */}
        <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign Form</DialogTitle>
              <DialogDescription>
                Type your full name below to confirm your signature on this form.
              </DialogDescription>
            </DialogHeader>

            {selectedSubmission && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="font-medium">{selectedSubmission.template?.template_name}</div>
                  <div className="text-sm text-muted-foreground font-mono">
                    {selectedSubmission.submission_number}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="typed-name">Type your full name to sign</Label>
                  <Input
                    id="typed-name"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="Enter your full name"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    By typing your name, you confirm that you have reviewed this form and 
                    agree to its contents.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSignDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSign}
                disabled={!typedName.trim() || signMutation.isPending}
              >
                {signMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PenTool className="h-4 w-4 mr-2" />
                )}
                Confirm Signature
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default PendingSignatures;
