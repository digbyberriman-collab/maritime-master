import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useTraining } from '@/modules/training/hooks/useTraining';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { DEFAULT_FAMILIARIZATION_SECTIONS } from '@/modules/training/constants';
import { 
  Plus, 
  FileText, 
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface FamiliarizationTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FamiliarizationTemplatesModal: React.FC<FamiliarizationTemplatesModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { templates, addFamiliarizationTemplate, isLoading } = useTraining();
  const { vessels } = useVessels();
  const { profile } = useAuth();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // Form state for new template
  const [formData, setFormData] = useState({
    vessel_id: '',
    template_name: '',
    total_duration_days: 14,
    applicable_ranks: [] as string[],
    sections: DEFAULT_FAMILIARIZATION_SECTIONS,
  });

  const rankOptions = [
    { value: 'master', label: 'Master' },
    { value: 'chief_officer', label: 'Chief Officer' },
    { value: 'chief_engineer', label: 'Chief Engineer' },
    { value: 'crew', label: 'Crew' },
    { value: 'dpa', label: 'DPA' },
    { value: 'shore_management', label: 'Shore Management' },
  ];

  const handleToggleRank = (rank: string) => {
    const newRanks = formData.applicable_ranks.includes(rank)
      ? formData.applicable_ranks.filter(r => r !== rank)
      : [...formData.applicable_ranks, rank];
    setFormData({ ...formData, applicable_ranks: newRanks });
  };

  const handleCreateTemplate = async () => {
    if (!formData.vessel_id || !formData.template_name) return;

    await addFamiliarizationTemplate.mutateAsync({
      vessel_id: formData.vessel_id,
      template_name: formData.template_name,
      total_duration_days: formData.total_duration_days,
      applicable_ranks: formData.applicable_ranks,
      sections: formData.sections as any,
      created_by: profile?.user_id,
      is_active: true,
    });

    setShowCreateForm(false);
    setFormData({
      vessel_id: '',
      template_name: '',
      total_duration_days: 14,
      applicable_ranks: [],
      sections: DEFAULT_FAMILIARIZATION_SECTIONS,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Familiarization Templates</span>
            {!showCreateForm && (
              <Button size="sm" onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {showCreateForm ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input
                  value={formData.template_name}
                  onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                  placeholder="e.g., Deck Officer Familiarization"
                />
              </div>
              <div className="space-y-2">
                <Label>Vessel *</Label>
                <Select value={formData.vessel_id} onValueChange={(v) => setFormData({ ...formData, vessel_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vessel" />
                  </SelectTrigger>
                  <SelectContent>
                    {vessels.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Duration (days)</Label>
              <Select 
                value={formData.total_duration_days.toString()} 
                onValueChange={(v) => setFormData({ ...formData, total_duration_days: parseInt(v) })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="21">21 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Applicable Ranks</Label>
              <div className="flex flex-wrap gap-2">
                {rankOptions.map(rank => (
                  <Badge
                    key={rank.value}
                    variant={formData.applicable_ranks.includes(rank.value) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => handleToggleRank(rank.value)}
                  >
                    {rank.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Checklist Sections</Label>
              <div className="space-y-2 border rounded-lg p-3">
                {formData.sections.map((section, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <div>
                      <p className="font-medium">{section.section_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {section.checklist_items.length} items • {section.required_days} days
                      </p>
                    </div>
                    <Badge variant="outline">{section.checklist_items.length}</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Using default familiarization sections. Custom sections can be added after creation.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateTemplate}
                disabled={!formData.vessel_id || !formData.template_name || addFamiliarizationTemplate.isPending}
              >
                {addFamiliarizationTemplate.isPending ? 'Creating...' : 'Create Template'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Templates Yet</h3>
                <p className="text-muted-foreground mb-4">Create reusable familiarization checklists</p>
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Template
                </Button>
              </div>
            ) : (
              templates.map(template => {
                const isExpanded = expandedTemplate === template.id;
                const sections = template.sections as any[];

                return (
                  <Collapsible
                    key={template.id}
                    open={isExpanded}
                    onOpenChange={() => setExpandedTemplate(isExpanded ? null : template.id)}
                  >
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRight className="h-5 w-5" />
                              )}
                              <div>
                                <CardTitle className="text-lg">{template.template_name}</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                  {template.total_duration_days} days • {sections?.length || 0} sections
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {template.applicable_ranks?.slice(0, 2).map((rank: string) => (
                                <Badge key={rank} variant="outline">{rank}</Badge>
                              ))}
                              {(template.applicable_ranks?.length || 0) > 2 && (
                                <Badge variant="outline">+{(template.applicable_ranks?.length || 0) - 2}</Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent>
                          {sections?.map((section: any, index: number) => (
                            <div key={index} className="mb-3 last:mb-0">
                              <h4 className="font-medium text-sm">{section.section_name}</h4>
                              <ul className="mt-1 space-y-1">
                                {section.checklist_items?.slice(0, 3).map((item: string, i: number) => (
                                  <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                                    {item}
                                  </li>
                                ))}
                                {section.checklist_items?.length > 3 && (
                                  <li className="text-sm text-muted-foreground italic">
                                    +{section.checklist_items.length - 3} more items
                                  </li>
                                )}
                              </ul>
                            </div>
                          ))}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FamiliarizationTemplatesModal;
