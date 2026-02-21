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
import { format, addYears } from 'date-fns';
import { cn } from '@/lib/utils';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCreateRiskAssessment, useBulkCreateHazards, useUpdateRiskAssessment } from '@/modules/risk-assessments/hooks/useRiskAssessments';
import { TASK_CATEGORIES, LIKELIHOOD_LEVELS, SEVERITY_LEVELS, COMMON_HAZARDS } from '@/modules/risk-assessments/constants';

interface CreateRiskAssessmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateRiskAssessmentModal = ({ open, onOpenChange }: CreateRiskAssessmentModalProps) => {
  const { profile } = useAuth();
  const { vessels } = useVessels();
  const createMutation = useCreateRiskAssessment();
  const createHazardsMutation = useBulkCreateHazards();
  const updateMutation = useUpdateRiskAssessment();

  const [formData, setFormData] = useState({
    vessel_id: '',
    task_name: '',
    task_description: '',
    task_location: '',
    task_date: new Date(),
    review_date: addYears(new Date(), 1),
    task_category: '',
  });

  const [hazards, setHazards] = useState<Array<{
    description: string;
    consequences: string;
    likelihood_before: number;
    severity_before: number;
    controls: string[];
    likelihood_after: number;
    severity_after: number;
    responsible_person: string;
  }>>([]);

  const handleSubmit = async () => {
    if (!profile?.user_id || !formData.vessel_id) return;

    try {
      const ra = await createMutation.mutateAsync({
        vessel_id: formData.vessel_id,
        task_name: formData.task_name,
        task_description: formData.task_description,
        task_location: formData.task_location,
        task_date: format(formData.task_date, 'yyyy-MM-dd'),
        review_date: format(formData.review_date, 'yyyy-MM-dd'),
        assessment_date: format(new Date(), 'yyyy-MM-dd'),
        assessed_by_id: profile.user_id,
        status: 'Draft',
        template_id: null,
        approved_by_id: null,
        linked_procedure_id: null,
        risk_score_initial: null,
        risk_score_residual: null,
      });

      if (hazards.length > 0) {
        const hazardData = hazards.map((h, idx) => ({
          risk_assessment_id: ra.id,
          hazard_description: h.description,
          consequences: h.consequences,
          likelihood_before: h.likelihood_before,
          severity_before: h.severity_before,
          risk_score_before: h.likelihood_before * h.severity_before,
          controls: h.controls,
          likelihood_after: h.likelihood_after,
          severity_after: h.severity_after,
          risk_score_after: h.likelihood_after * h.severity_after,
          responsible_person: h.responsible_person,
          sequence_order: idx,
        }));

        await createHazardsMutation.mutateAsync(hazardData);

        const maxInitial = Math.max(...hazardData.map(h => h.risk_score_before));
        const maxResidual = Math.max(...hazardData.map(h => h.risk_score_after));
        await updateMutation.mutateAsync({
          id: ra.id,
          risk_score_initial: maxInitial,
          risk_score_residual: maxResidual,
        });
      }

      onOpenChange(false);
      setFormData({
        vessel_id: '',
        task_name: '',
        task_description: '',
        task_location: '',
        task_date: new Date(),
        review_date: addYears(new Date(), 1),
        task_category: '',
      });
      setHazards([]);
    } catch (error) {
      console.error('Error creating risk assessment:', error);
    }
  };

  const loadTemplateHazards = (category: string) => {
    const templateHazards = COMMON_HAZARDS[category] || [];
    setHazards(templateHazards.map(h => ({
      description: h.description,
      consequences: h.consequences,
      likelihood_before: 3,
      severity_before: 3,
      controls: h.suggestedControls,
      likelihood_after: 2,
      severity_after: 2,
      responsible_person: '',
    })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Risk Assessment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vessel *</Label>
              <Select value={formData.vessel_id} onValueChange={(v) => setFormData(prev => ({ ...prev, vessel_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select vessel" /></SelectTrigger>
                <SelectContent>
                  {vessels?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Task Category</Label>
              <Select value={formData.task_category} onValueChange={(v) => { setFormData(prev => ({ ...prev, task_category: v })); loadTemplateHazards(v); }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Task Name *</Label>
            <Input value={formData.task_name} onChange={(e) => setFormData(prev => ({ ...prev, task_name: e.target.value }))} placeholder="e.g., Enclosed Space Entry - Ballast Tank 3" />
          </div>

          <div className="space-y-2">
            <Label>Task Location *</Label>
            <Input value={formData.task_location} onChange={(e) => setFormData(prev => ({ ...prev, task_location: e.target.value }))} placeholder="e.g., Ballast Tank 3, Port Side" />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={formData.task_description} onChange={(e) => setFormData(prev => ({ ...prev, task_description: e.target.value }))} placeholder="Describe the task and scope..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Task Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.task_date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.task_date} onSelect={(d) => d && setFormData(prev => ({ ...prev, task_date: d }))} className="pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Review Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.review_date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.review_date} onSelect={(d) => d && setFormData(prev => ({ ...prev, review_date: d }))} className="pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
          </div>

          {hazards.length > 0 && (
            <div className="border rounded-lg p-4">
              <p className="font-medium mb-2">Pre-loaded Hazards ({hazards.length})</p>
              <p className="text-sm text-muted-foreground">Hazards from the selected category have been loaded. You can edit them after creation.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!formData.vessel_id || !formData.task_name || !formData.task_location || createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Assessment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRiskAssessmentModal;
