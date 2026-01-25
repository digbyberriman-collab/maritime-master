import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, addHours } from 'date-fns';
import { cn } from '@/lib/utils';
import { useVessels } from '@/hooks/useVessels';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateWorkPermit } from '@/hooks/useRiskAssessments';
import { PERMIT_TYPE_OPTIONS, SAFETY_PRECAUTIONS, EMERGENCY_EQUIPMENT } from '@/lib/riskAssessmentConstants';

interface CreateWorkPermitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateWorkPermitModal = ({ open, onOpenChange }: CreateWorkPermitModalProps) => {
  const { profile } = useAuth();
  const { vessels } = useVessels();
  const createMutation = useCreateWorkPermit();

  const [formData, setFormData] = useState({
    vessel_id: '',
    permit_type: '',
    work_description: '',
    work_location: '',
    start_datetime: new Date(),
    end_datetime: addHours(new Date(), 4),
  });

  const handleSubmit = async () => {
    if (!profile?.user_id || !formData.vessel_id) return;

    const precautions = SAFETY_PRECAUTIONS[formData.permit_type] || SAFETY_PRECAUTIONS['Other'];
    const equipment = EMERGENCY_EQUIPMENT[formData.permit_type] || EMERGENCY_EQUIPMENT['Other'];

    await createMutation.mutateAsync({
      vessel_id: formData.vessel_id,
      permit_type: formData.permit_type,
      work_description: formData.work_description,
      work_location: formData.work_location,
      start_datetime: formData.start_datetime.toISOString(),
      end_datetime: formData.end_datetime.toISOString(),
      requested_by_id: profile.user_id,
      status: 'Pending',
      workers: [],
      safety_precautions_required: precautions.map(p => ({ text: p, checked: false })),
      emergency_equipment: equipment,
      risk_assessment_id: null,
      approved_by_id: null,
      actual_start: null,
      actual_end: null,
      precautions_verified: false,
      equipment_isolated: false,
      atmosphere_tested: false,
      atmosphere_results: null,
      fire_watch_required: formData.permit_type === 'Hot_Work',
      fire_watch_assigned_id: null,
      cancellation_reason: null,
      completion_notes: null,
    });

    onOpenChange(false);
    setFormData({
      vessel_id: '',
      permit_type: '',
      work_description: '',
      work_location: '',
      start_datetime: new Date(),
      end_datetime: addHours(new Date(), 4),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Work Permit</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vessel *</Label>
              <Select value={formData.vessel_id} onValueChange={(v) => setFormData(prev => ({ ...prev, vessel_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select vessel" /></SelectTrigger>
                <SelectContent>{vessels?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Permit Type *</Label>
              <Select value={formData.permit_type} onValueChange={(v) => setFormData(prev => ({ ...prev, permit_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{PERMIT_TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Work Description *</Label>
            <Textarea value={formData.work_description} onChange={(e) => setFormData(prev => ({ ...prev, work_description: e.target.value }))} placeholder="Describe the work to be performed..." />
          </div>
          <div className="space-y-2">
            <Label>Work Location *</Label>
            <Input value={formData.work_location} onChange={(e) => setFormData(prev => ({ ...prev, work_location: e.target.value }))} placeholder="e.g., Engine Room, Frame 45" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.start_datetime, "PPP HH:mm")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.start_datetime} onSelect={(d) => d && setFormData(prev => ({ ...prev, start_datetime: d }))} className="pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.end_datetime, "PPP HH:mm")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.end_datetime} onSelect={(d) => d && setFormData(prev => ({ ...prev, end_datetime: d }))} className="pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!formData.vessel_id || !formData.permit_type || !formData.work_description || !formData.work_location || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Permit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWorkPermitModal;
