import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { PERMIT_TYPE_OPTIONS } from '@/lib/riskAssessmentConstants';
import type { WorkPermit } from '@/hooks/useRiskAssessments';

interface WorkPermitDetailModalProps {
  permit: WorkPermit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WorkPermitDetailModal = ({ permit, open, onOpenChange }: WorkPermitDetailModalProps) => {
  const getFullName = (profile?: { first_name: string; last_name: string }) => {
    if (!profile) return 'Unknown';
    return `${profile.first_name} ${profile.last_name}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending': return <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>;
      case 'Approved': return <Badge className="bg-blue-100 text-blue-700">Approved</Badge>;
      case 'Active': return <Badge className="bg-green-100 text-green-700">Active</Badge>;
      case 'Completed': return <Badge className="bg-gray-100 text-gray-700">Completed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPermitTypeLabel = (type: string) => {
    const option = PERMIT_TYPE_OPTIONS.find(o => o.value === type);
    return option?.label || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono">{permit.permit_number}</span>
            {getStatusBadge(permit.status)}
            <Badge variant="outline">{getPermitTypeLabel(permit.permit_type)}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Work Description</label>
              <p className="font-medium">{permit.work_description}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Location</label>
              <p>{permit.work_location}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Start</label>
              <p>{format(new Date(permit.start_datetime), 'dd MMM yyyy HH:mm')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">End</label>
              <p>{format(new Date(permit.end_datetime), 'dd MMM yyyy HH:mm')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Requested By</label>
              <p>{getFullName(permit.requested_by)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Approved By</label>
              <p>{permit.approved_by ? getFullName(permit.approved_by) : 'Pending'}</p>
            </div>
          </div>

          {permit.emergency_equipment.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Emergency Equipment</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {permit.emergency_equipment.map((eq, i) => (
                  <Badge key={i} variant="outline">{eq}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 border rounded-lg">
              <p className="text-sm text-muted-foreground">Precautions Verified</p>
              <p className="font-medium">{permit.precautions_verified ? '✓ Yes' : '✗ No'}</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-sm text-muted-foreground">Equipment Isolated</p>
              <p className="font-medium">{permit.equipment_isolated ? '✓ Yes' : '✗ No'}</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-sm text-muted-foreground">Atmosphere Tested</p>
              <p className="font-medium">{permit.atmosphere_tested ? '✓ Yes' : '✗ No'}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkPermitDetailModal;
