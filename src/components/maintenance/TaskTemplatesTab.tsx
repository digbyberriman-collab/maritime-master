import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useMaintenance } from '@/hooks/useMaintenance';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { INTERVAL_TYPES, TASK_TYPES, RESPONSIBLE_ROLES, getTaskTypeConfig } from '@/lib/maintenanceConstants';
import TaskTemplateModal, { TaskTemplateData } from './TaskTemplateModal';
import { 
  Plus, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Play,
  Clock,
  Settings
} from 'lucide-react';
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

interface TaskTemplate {
  id: string;
  task_name: string;
  task_type: string;
  task_description: string | null;
  interval_type: string;
  interval_value: number;
  equipment_id: string | null;
  category_id: string | null;
  responsible_role: string | null;
  estimated_duration_minutes: number | null;
  safety_precautions: string | null;
  required_tools: string[] | null;
  required_spares: string[] | null;
  is_active: boolean;
  created_at: string;
  equipment?: { equipment_name: string; equipment_code: string } | null;
  category?: { category_name: string } | null;
}

const TaskTemplatesTab: React.FC = () => {
  const { equipment, flatCategories } = useMaintenance();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplateData | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['maintenance-task-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_task_templates')
        .select(`
          *,
          equipment:equipment(equipment_name, equipment_code),
          category:equipment_categories(category_name)
        `)
        .order('task_name');
      
      if (error) throw error;
      return data as TaskTemplate[];
    },
  });

  // Create template mutation
  const createTemplate = useMutation({
    mutationFn: async (template: TaskTemplateData) => {
      const { data, error } = await supabase
        .from('maintenance_task_templates')
        .insert({
          task_name: template.task_name,
          task_type: template.task_type,
          task_description: template.task_description || null,
          interval_type: template.interval_type,
          interval_value: template.interval_value,
          equipment_id: template.equipment_id,
          category_id: template.category_id,
          responsible_role: template.responsible_role,
          estimated_duration_minutes: template.estimated_duration_minutes,
          safety_precautions: template.safety_precautions || null,
          required_tools: template.required_tools,
          required_spares: template.required_spares,
          is_active: template.is_active,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-task-templates'] });
      toast({ title: 'Template created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating template', description: error.message, variant: 'destructive' });
    },
  });

  // Update template mutation
  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: TaskTemplateData & { id: string }) => {
      const { data, error } = await supabase
        .from('maintenance_task_templates')
        .update({
          task_name: updates.task_name,
          task_type: updates.task_type,
          task_description: updates.task_description || null,
          interval_type: updates.interval_type,
          interval_value: updates.interval_value,
          equipment_id: updates.equipment_id,
          category_id: updates.category_id,
          responsible_role: updates.responsible_role,
          estimated_duration_minutes: updates.estimated_duration_minutes,
          safety_precautions: updates.safety_precautions || null,
          required_tools: updates.required_tools,
          required_spares: updates.required_spares,
          is_active: updates.is_active,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-task-templates'] });
      toast({ title: 'Template updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating template', description: error.message, variant: 'destructive' });
    },
  });

  // Toggle active status
  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('maintenance_task_templates')
        .update({ is_active })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-task-templates'] });
    },
  });

  // Delete template mutation
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('maintenance_task_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-task-templates'] });
      toast({ title: 'Template deleted successfully' });
      setDeleteTemplateId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting template', description: error.message, variant: 'destructive' });
    },
  });

  const handleSaveTemplate = (template: TaskTemplateData) => {
    if (editingTemplate?.id) {
      updateTemplate.mutate({ ...template, id: editingTemplate.id });
    } else {
      createTemplate.mutate(template);
    }
    setEditingTemplate(null);
  };

  const handleEdit = (template: TaskTemplate) => {
    setEditingTemplate({
      id: template.id,
      task_name: template.task_name,
      task_type: template.task_type,
      task_description: template.task_description || '',
      interval_type: template.interval_type,
      interval_value: template.interval_value,
      equipment_id: template.equipment_id,
      category_id: template.category_id,
      responsible_role: template.responsible_role || 'Chief_Engineer',
      estimated_duration_minutes: template.estimated_duration_minutes || 60,
      safety_precautions: template.safety_precautions || '',
      required_tools: template.required_tools || [],
      required_spares: template.required_spares || [],
      is_active: template.is_active,
    });
    setShowModal(true);
  };

  const getIntervalLabel = (type: string, value: number): string => {
    const intervalConfig = INTERVAL_TYPES.find(t => t.value === type);
    if (type === 'Hours') return `Every ${value} hours`;
    if (type === 'Days') return `Every ${value} days`;
    if (type === 'Months') return `Every ${value} months`;
    if (type === 'Annual') return `Every ${value} year${value > 1 ? 's' : ''}`;
    return `${intervalConfig?.label || type}: ${value}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Task Templates
          </CardTitle>
          <Button onClick={() => { setEditingTemplate(null); setShowModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Define recurring maintenance tasks that will automatically generate work orders based on time or running hours intervals.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No task templates defined</p>
            <Button 
              variant="link" 
              onClick={() => { setEditingTemplate(null); setShowModal(true); }}
            >
              Create your first template
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Active</TableHead>
                <TableHead>Task Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map(template => {
                const typeConfig = getTaskTypeConfig(template.task_type);
                return (
                  <TableRow key={template.id} className={!template.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <Switch
                        checked={template.is_active}
                        onCheckedChange={(checked) => toggleActive.mutate({ id: template.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{template.task_name}</p>
                        {template.task_description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {template.task_description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={typeConfig?.color || ''}>
                        {typeConfig?.label || template.task_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {template.equipment ? (
                        <span className="text-sm">
                          {template.equipment.equipment_code}
                        </span>
                      ) : template.category ? (
                        <span className="text-sm text-muted-foreground">
                          All: {template.category.category_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3" />
                        {getIntervalLabel(template.interval_type, template.interval_value)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {template.estimated_duration_minutes 
                        ? `${template.estimated_duration_minutes} min` 
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          title="Edit"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          title="Delete"
                          onClick={() => setDeleteTemplateId(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Template Modal */}
      <TaskTemplateModal
        open={showModal}
        onOpenChange={setShowModal}
        equipment={equipment}
        categories={flatCategories}
        onSave={handleSaveTemplate}
        editingTemplate={editingTemplate}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
              Existing tasks created from this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplateId && deleteTemplate.mutate(deleteTemplateId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default TaskTemplatesTab;
