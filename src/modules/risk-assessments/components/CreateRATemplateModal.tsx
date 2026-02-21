import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCreateRiskAssessmentTemplate } from '@/modules/risk-assessments/hooks/useRiskAssessments';
import { TASK_CATEGORIES } from '@/modules/risk-assessments/constants';

interface CreateRATemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateRATemplateModal = ({ open, onOpenChange }: CreateRATemplateModalProps) => {
  const { profile } = useAuth();
  const { vessels } = useVessels();
  const createMutation = useCreateRiskAssessmentTemplate();

  const [formData, setFormData] = useState({
    template_name: '',
    task_category: '',
    vessel_id: '',
  });

  const handleSubmit = async () => {
    if (!profile?.user_id) return;

    await createMutation.mutateAsync({
      template_name: formData.template_name,
      task_category: formData.task_category,
      vessel_id: formData.vessel_id || null,
      created_by: profile.user_id,
      common_hazards: [],
      is_active: true,
    });

    onOpenChange(false);
    setFormData({ template_name: '', task_category: '', vessel_id: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create RA Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template Name *</Label>
            <Input value={formData.template_name} onChange={(e) => setFormData(prev => ({ ...prev, template_name: e.target.value }))} placeholder="e.g., Hot Work on Deck" />
          </div>
          <div className="space-y-2">
            <Label>Task Category *</Label>
            <Select value={formData.task_category} onValueChange={(v) => setFormData(prev => ({ ...prev, task_category: v }))}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{TASK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Vessel (optional - leave empty for company-wide)</Label>
            <Select value={formData.vessel_id || "__all__"} onValueChange={(v) => setFormData(prev => ({ ...prev, vessel_id: v === "__all__" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="All vessels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All vessels</SelectItem>
                {vessels?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!formData.template_name || !formData.task_category || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRATemplateModal;
