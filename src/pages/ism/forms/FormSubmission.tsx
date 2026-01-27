import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVessel } from '@/contexts/VesselContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Save, Send, CheckCircle, Clock, 
  FileText, Loader2, AlertTriangle
} from 'lucide-react';
import { useFormTemplate } from '@/hooks/useFormTemplates';
import { 
  getFormTypeInfo, 
  getSubmissionStatusConfig,
  generateContentHash,
  type FormField,
  type FormSchema 
} from '@/lib/formConstants';
import type { Json } from '@/integrations/supabase/types';

interface FormSubmission {
  id: string;
  submission_number: string;
  template_id: string;
  template_version: number;
  company_id: string;
  vessel_id: string | null;
  form_data: Json;
  status: string;
  is_locked: boolean;
  created_by: string | null;
  created_at: string;
}

const FormSubmissionPage: React.FC = () => {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [searchParams] = useSearchParams();
  const templateIdFromQuery = searchParams.get('template');
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { selectedVesselId, selectedVessel } = useVessel();
  const { toast } = useToast();

  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load template for new submissions
  const { data: template, isLoading: templateLoading } = useFormTemplate(
    submissionId ? null : templateIdFromQuery
  );

  // Load existing submission
  useEffect(() => {
    if (submissionId) {
      loadSubmission();
    } else if (templateIdFromQuery && template) {
      // New submission - initialize empty form data
      initializeFormData();
      setLoading(false);
    }
  }, [submissionId, template]);

  const loadSubmission = async () => {
    if (!submissionId) return;

    try {
      const { data, error } = await supabase
        .from('form_submissions')
        .select(`
          *,
          template:form_templates(*)
        `)
        .eq('id', submissionId)
        .single();

      if (error) throw error;

      setSubmission(data);
      setFormData((data.form_data as Record<string, unknown>) || {});
    } catch (error) {
      console.error('Error loading submission:', error);
      toast({
        title: 'Error',
        description: 'Failed to load form submission',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const initializeFormData = () => {
    if (!template) return;

    const schema = template.form_schema as unknown as FormSchema;
    const initialData: Record<string, unknown> = {};

    schema.fields.forEach((field) => {
      if (field.type === 'checkbox') {
        initialData[field.id] = false;
      } else if (field.type === 'table') {
        initialData[field.id] = [];
      } else {
        initialData[field.id] = '';
      }
    });

    setFormData(initialData);
  };

  const handleFieldChange = (fieldId: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const saveSubmission = async () => {
    if (!profile?.company_id || !user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      if (submission) {
        // Update existing submission
        if (submission.is_locked) {
          throw new Error('Form is locked and cannot be modified');
        }

        const { error } = await supabase
          .from('form_submissions')
          .update({ 
            form_data: formData as unknown as Json,
            status: 'IN_PROGRESS'
          })
          .eq('id', submission.id);

        if (error) throw error;

        toast({
          title: 'Saved',
          description: 'Form saved successfully',
        });
      } else {
        // Create new submission
        const templateToUse = template;
        if (!templateToUse) throw new Error('No template selected');

        const insertData = {
          template_id: templateToUse.id,
          template_version: templateToUse.version,
          company_id: profile.company_id,
          vessel_id: selectedVesselId || null,
          form_data: formData as unknown as Json,
          status: 'DRAFT',
          created_date: new Date().toISOString().split('T')[0],
          created_time_utc: new Date().toISOString(),
          created_by: user.id,
        };

        const { data: newSubmission, error } = await supabase
          .from('form_submissions')
          .insert(insertData as any)
          .select()
          .single();

        if (error) throw error;

        setSubmission(newSubmission);
        toast({
          title: 'Created',
          description: `Form ${newSubmission.submission_number} created`,
        });

        // Update URL to include submission ID
        navigate(`/ism/forms/submission/${newSubmission.id}`, { replace: true });
      }
    } catch (error) {
      console.error('Failed to save:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitForSignature = async () => {
    if (!submission) {
      await saveSubmission();
      return;
    }

    setSubmitting(true);

    try {
      const contentHash = generateContentHash(formData as Record<string, unknown>);

      const { error } = await supabase
        .from('form_submissions')
        .update({
          form_data: formData as unknown as Json,
          status: 'PENDING_SIGNATURE',
          submitted_at: new Date().toISOString(),
          submitted_by: user?.id,
          content_hash: contentHash,
          is_locked: true,
          locked_at: new Date().toISOString(),
        })
        .eq('id', submission.id);

      if (error) throw error;

      toast({
        title: 'Submitted',
        description: 'Form submitted for signature',
      });

      navigate('/ism/forms/pending');
    } catch (error) {
      console.error('Failed to submit:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit form',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Get the active template (from submission or query)
  const activeTemplate = submission 
    ? (submission as any).template 
    : template;

  const schema: FormSchema | null = activeTemplate?.form_schema 
    ? activeTemplate.form_schema as unknown as FormSchema
    : null;

  const isLocked = submission?.is_locked || false;
  const canEdit = !isLocked && ['DRAFT', 'IN_PROGRESS'].includes(submission?.status || 'DRAFT');

  // Render individual field based on type
  const renderField = (field: FormField) => {
    const value = formData[field.id];
    const disabled = !canEdit;

    switch (field.type) {
      case 'section':
        return (
          <div key={field.id} className="col-span-2 border-b pb-2 mb-4">
            <h3 className="text-lg font-semibold text-foreground">{field.label}</h3>
          </div>
        );

      case 'text':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              required={field.required}
            />
          </div>
        );

      case 'textarea':
        return (
          <div key={field.id} className="space-y-2 col-span-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={field.id}
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              required={field.required}
              rows={3}
            />
          </div>
        );

      case 'number':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="number"
              value={(value as number) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.valueAsNumber || '')}
              placeholder={field.placeholder}
              disabled={disabled}
              required={field.required}
              min={field.validation?.min}
              max={field.validation?.max}
            />
          </div>
        );

      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="date"
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              disabled={disabled}
              required={field.required}
            />
          </div>
        );

      case 'datetime':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="datetime-local"
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              disabled={disabled}
              required={field.required}
            />
          </div>
        );

      case 'time':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="time"
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              disabled={disabled}
              required={field.required}
            />
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center gap-2">
            <Checkbox
              id={field.id}
              checked={(value as boolean) || false}
              onCheckedChange={(checked) => handleFieldChange(field.id, checked)}
              disabled={disabled}
            />
            <Label htmlFor={field.id} className="cursor-pointer">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
          </div>
        );

      case 'yes_no':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <RadioGroup
              value={(value as string) || ''}
              onValueChange={(v) => handleFieldChange(field.id, v)}
              disabled={disabled}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id={`${field.id}-yes`} />
                <Label htmlFor={`${field.id}-yes`}>Yes</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id={`${field.id}-no`} />
                <Label htmlFor={`${field.id}-no`}>No</Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 'yes_no_na':
        return (
          <div key={field.id} className="space-y-2">
            <Label>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <RadioGroup
              value={(value as string) || ''}
              onValueChange={(v) => handleFieldChange(field.id, v)}
              disabled={disabled}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yes" id={`${field.id}-yes`} />
                <Label htmlFor={`${field.id}-yes`}>Yes</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id={`${field.id}-no`} />
                <Label htmlFor={`${field.id}-no`}>No</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="na" id={`${field.id}-na`} />
                <Label htmlFor={`${field.id}-na`}>N/A</Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select
              value={(value as string) || ''}
              onValueChange={(v) => handleFieldChange(field.id, v)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'signature':
        return (
          <div key={field.id} className="space-y-2 col-span-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Card className="border-2 border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                {isLocked ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span>Signature captured</span>
                  </div>
                ) : (
                  <span>Signature will be captured during submission</span>
                )}
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
            />
          </div>
        );
    }
  };

  if (loading || templateLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!activeTemplate || !schema) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
            <h3 className="text-lg font-medium">Template Not Found</h3>
            <p className="text-muted-foreground text-sm mt-1">
              The form template could not be loaded
            </p>
            <Button className="mt-4" onClick={() => navigate('/ism/forms/templates')}>
              Back to Templates
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const typeInfo = getFormTypeInfo(activeTemplate.form_type);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{typeInfo.icon}</span>
                <h1 className="text-2xl font-bold text-foreground">
                  {activeTemplate.template_name}
                </h1>
              </div>
              <div className="flex items-center gap-2 mt-1 text-muted-foreground text-sm">
                <span>{submission?.submission_number || 'New Submission'}</span>
                {selectedVessel && (
                  <>
                    <span>•</span>
                    <span>{selectedVessel.name}</span>
                  </>
                )}
                {submission && (
                  <>
                    <span>•</span>
                    <Badge 
                      variant="outline" 
                      className={getSubmissionStatusConfig(submission.status).color}
                    >
                      {getSubmissionStatusConfig(submission.status).label}
                    </Badge>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <Button variant="outline" onClick={saveSubmission} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Draft
                </Button>
                <Button onClick={submitForSignature} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Submit for Signature
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Locked banner */}
        {isLocked && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-3 flex items-center gap-2 text-amber-800">
              <Clock className="h-5 w-5" />
              <span>This form is locked and cannot be modified.</span>
            </CardContent>
          </Card>
        )}

        {/* Form Fields */}
        <Card>
          <CardHeader>
            <CardTitle>Form Details</CardTitle>
            {activeTemplate.description && (
              <CardDescription>{activeTemplate.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {schema.fields.map(renderField)}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default FormSubmissionPage;
