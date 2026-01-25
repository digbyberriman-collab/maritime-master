import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { getRiskLevel } from '@/lib/riskAssessmentConstants';
import type { RiskAssessment } from '@/hooks/useRiskAssessments';
import RiskMatrix from './RiskMatrix';

interface RiskAssessmentDetailModalProps {
  assessment: RiskAssessment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RiskAssessmentDetailModal = ({ assessment, open, onOpenChange }: RiskAssessmentDetailModalProps) => {
  const getFullName = (profile?: { first_name: string; last_name: string }) => {
    if (!profile) return 'Unknown';
    return `${profile.first_name} ${profile.last_name}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved': return <Badge className="bg-green-100 text-green-700">Approved</Badge>;
      case 'Draft': return <Badge className="bg-gray-100 text-gray-700">Draft</Badge>;
      case 'Under_Review': return <Badge className="bg-yellow-100 text-yellow-700">Under Review</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const riskLevel = assessment.risk_score_residual ? getRiskLevel(assessment.risk_score_residual) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{assessment.assessment_number}</span>
            {getStatusBadge(assessment.status)}
            {riskLevel && (
              <Badge className={`${riskLevel.bgColor} ${riskLevel.color}`}>
                {riskLevel.level} Risk
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Task Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Task Name</label>
              <p className="font-medium">{assessment.task_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Location</label>
              <p>{assessment.task_location}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Task Date</label>
              <p>{format(new Date(assessment.task_date), 'dd MMM yyyy')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Review Date</label>
              <p>{format(new Date(assessment.review_date), 'dd MMM yyyy')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Assessed By</label>
              <p>{getFullName(assessment.assessed_by)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Approved By</label>
              <p>{assessment.approved_by ? getFullName(assessment.approved_by) : 'Pending'}</p>
            </div>
          </div>

          {assessment.task_description && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Description</label>
              <p className="text-sm mt-1">{assessment.task_description}</p>
            </div>
          )}

          {/* Risk Matrix */}
          <div className="flex justify-center py-4">
            <RiskMatrix size="md" />
          </div>

          {/* Risk Scores */}
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Initial Risk Score</p>
              <p className="text-2xl font-bold">{assessment.risk_score_initial || 'N/A'}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Residual Risk Score</p>
              <p className="text-2xl font-bold">{assessment.risk_score_residual || 'N/A'}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RiskAssessmentDetailModal;
