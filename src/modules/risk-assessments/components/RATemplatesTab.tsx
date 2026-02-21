import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useRiskAssessmentTemplates, useUpdateRiskAssessmentTemplate, type RiskAssessmentTemplate } from '@/modules/risk-assessments/hooks/useRiskAssessments';
import { TASK_CATEGORIES, COMMON_HAZARDS } from '@/modules/risk-assessments/constants';
import CreateRATemplateModal from './CreateRATemplateModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const RATemplatesTab = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTemplate, setDeleteTemplate] = useState<RiskAssessmentTemplate | null>(null);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());

  const { data: templates, isLoading } = useRiskAssessmentTemplates();
  const updateMutation = useUpdateRiskAssessmentTemplate();

  const handleToggleExpand = (templateId: string) => {
    setExpandedTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
      } else {
        newSet.add(templateId);
      }
      return newSet;
    });
  };

  const handleDeactivate = () => {
    if (deleteTemplate) {
      updateMutation.mutate(
        { id: deleteTemplate.id, is_active: false },
        { onSuccess: () => setDeleteTemplate(null) }
      );
    }
  };

  // Group templates by category
  const templatesByCategory = templates?.reduce((acc, template) => {
    const category = template.task_category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, RiskAssessmentTemplate[]>) || {};

  // Pre-built templates from COMMON_HAZARDS
  const builtInCategories = Object.keys(COMMON_HAZARDS);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Risk Assessment Templates
          </CardTitle>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Built-in Templates */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Built-in Templates</h3>
          <p className="text-sm text-muted-foreground mb-4">
            These templates come with pre-defined hazards and controls for common maritime operations.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {builtInCategories.map((category) => (
              <Collapsible
                key={category}
                open={expandedTemplates.has(category)}
                onOpenChange={() => handleToggleExpand(category)}
              >
                <Card className="border-2 hover:border-primary/50 transition-colors">
                  <CollapsibleTrigger asChild>
                    <div className="p-4 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{category}</h4>
                          <p className="text-sm text-muted-foreground">
                            {COMMON_HAZARDS[category]?.length || 0} pre-defined hazards
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Built-in</Badge>
                          {expandedTemplates.has(category) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 border-t pt-4">
                      <p className="text-sm font-medium mb-2">Common Hazards:</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {COMMON_HAZARDS[category]?.map((hazard, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            {hazard.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        </div>

        {/* Custom Templates */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Custom Templates</h3>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !templates || templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p>No custom templates created yet.</p>
              <p className="text-sm">Create your own templates for recurring tasks.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Card key={template.id} className="relative">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium">{template.template_name}</h4>
                        <Badge variant="outline" className="mt-1">
                          {template.task_category}
                        </Badge>
                        <p className="text-sm text-muted-foreground mt-2">
                          {(template.common_hazards as any[])?.length || 0} hazards defined
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTemplate(template)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <CreateRATemplateModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />

      <AlertDialog open={!!deleteTemplate} onOpenChange={(open) => !open && setDeleteTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the template "{deleteTemplate?.template_name}".
              It will no longer appear in the template selection when creating new risk assessments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} className="bg-destructive text-destructive-foreground">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default RATemplatesTab;
