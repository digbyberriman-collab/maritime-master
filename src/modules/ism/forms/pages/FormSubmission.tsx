import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/shared/hooks/use-toast';
import { 
  ArrowLeft, ArrowRight, Save, Send, CheckCircle, Clock, 
  FileText, Loader2, AlertTriangle, Users
} from 'lucide-react';
import { useFormTemplate } from '@/modules/ism/forms/hooks/useFormTemplates';
import FieldRenderer from '@/modules/ism/forms/components/FieldRenderer';
import SignaturePad, { type SignatureData } from '@/modules/ism/forms/components/SignaturePad';
import FormProgressBar from '@/modules/ism/forms/components/FormProgressBar';
import { 
  getFormTypeInfo, 
  getSubmissionStatusConfig,
  generateContentHash,
  type FormField,
  type FormSchema,
  type RequiredSigner
} from '@/modules/ism/forms/constants';
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
  template?: {
    id: string;
    template_name: string;
    form_schema: Json;
    required_signers: Json;
    form_type: string;
    description?: string;
    allow_parallel_signing?: boolean;
  };
}

const FormSubmissionPage: React.FC = () => {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [searchParams] = useSearchParams();
  const templateIdFromQuery = searchParams.get('templateId') || searchParams.get('template');
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { selectedVesselId, selectedVessel } = useVessel();
  const { toast } = useToast();

  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [signatures, setSignatures] = useState<Record<string, SignatureData | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Load template for new submissions
  const { data: template, isLoading: templateLoading } = useFormTemplate(
    submissionId ? null : templateIdFromQuery
  );

  // Load existing submission
  useEffect(() => {
    if (submissionId) {
      loadSubmission();
    } else if (templateIdFromQuery && template) {
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
          template:form_templates(
            id, template_name, form_schema, required_signers, 
            form_type, description, allow_parallel_signing
          )
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

    schema.fields?.forEach((field) => {
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

  // Get the active template
  const activeTemplate = submission?.template || template;

  const schema: FormSchema | null = useMemo(() => {
    if (!activeTemplate?.form_schema) return null;
    return activeTemplate.form_schema as unknown as FormSchema;
  }, [activeTemplate]);

  const requiredSigners: RequiredSigner[] = useMemo(() => {
    if (!activeTemplate) return [];
    return (activeTemplate.required_signers as unknown as RequiredSigner[]) || [];
  }, [activeTemplate]);

  // Calculate pages
  const pages = useMemo(() => {
    if (!schema?.fields) return [];
    
    // Group fields by pageNumber, default to page 1
    const pageMap = new Map<number, FormField[]>();
    schema.fields.forEach(field => {
      const pageNum = field.pageNumber || 1;
      if (!pageMap.has(pageNum)) {
        pageMap.set(pageNum, []);
      }
      pageMap.get(pageNum)!.push(field);
    });

    // Convert to sorted array
    return Array.from(pageMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([num, fields]) => ({ number: num, fields }));
  }, [schema]);

  const totalPages = pages.length || 1;
  const currentPageFields = pages[currentPage - 1]?.fields || schema?.fields || [];

  // Calculate completion
  const { completedFields, totalFields } = useMemo(() => {
    if (!schema?.fields) return { completedFields: 0, totalFields: 0 };

    const requiredFields = schema.fields.filter(f => f.required);
    const completed = requiredFields.filter(f => {
      const value = formData[f.id];
      if (value === null || value === undefined) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    });

    return {
      completedFields: completed.length,
      totalFields: requiredFields.length,
    };
  }, [schema, formData]);

  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  }, []);

  const handleSignatureChange = useCallback((signerId: string, signature: SignatureData | null) => {
    setSignatures(prev => ({
      ...prev,
      [signerId]: signature
    }));
  }, []);

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
    // Validate required fields
    if (completedFields < totalFields) {
      toast({
        title: 'Incomplete Form',
        description: `Please complete all required fields (${completedFields}/${totalFields})`,
        variant: 'destructive',
      });
      return;
    }

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
          status: requiredSigners.length > 0 ? 'PENDING_SIGNATURE' : 'SIGNED',
          submitted_at: new Date().toISOString(),
          submitted_by: user?.id,
          content_hash: contentHash,
          is_locked: requiredSigners.length === 0,
          locked_at: requiredSigners.length === 0 ? new Date().toISOString() : null,
        })
        .eq('id', submission.id);

      if (error) throw error;

      toast({
        title: 'Submitted',
        description: requiredSigners.length > 0 
          ? 'Form submitted for signature' 
          : 'Form completed successfully',
      });

      navigate(requiredSigners.length > 0 ? '/ism/forms/pending' : '/ism/forms/submissions');
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

  const isLocked = submission?.is_locked || false;
  const canEdit = !isLocked && ['DRAFT', 'IN_PROGRESS'].includes(submission?.status || 'DRAFT');

  // Navigation handlers
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
            <AlertTriangle className="h-12 w-12 text-warning mb-4" />
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
                  {requiredSigners.length > 0 ? 'Submit for Signature' : 'Complete Form'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <FormProgressBar
          currentPage={currentPage}
          totalPages={totalPages}
          completedFields={completedFields}
          totalFields={totalFields}
        />

        {/* Locked banner */}
        {isLocked && (
          <Card className="border-warning/50 bg-warning/10">
            <CardContent className="py-3 flex items-center gap-2 text-warning">
              <Clock className="h-5 w-5" />
              <span>This form is locked and cannot be modified.</span>
            </CardContent>
          </Card>
        )}

        {/* Form Fields */}
        <Card>
          <CardHeader>
            <CardTitle>
              {totalPages > 1 ? `Section ${currentPage}` : 'Form Details'}
            </CardTitle>
            {activeTemplate.description && (
              <CardDescription>{activeTemplate.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {currentPageFields.map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  value={formData[field.id]}
                  onChange={handleFieldChange}
                  disabled={!canEdit}
                  allValues={formData}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={goToPrevPage}
              disabled={currentPage === 1}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Signatures Section - Show on last page or if no pages */}
        {requiredSigners.length > 0 && currentPage === totalPages && (
          <>
            <Separator />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Required Signatures
                </CardTitle>
                <CardDescription>
                  {activeTemplate.allow_parallel_signing
                    ? 'Signatures can be collected in any order'
                    : 'Signatures must be collected in sequence'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {requiredSigners.map((signer, index) => (
                  <SignaturePad
                    key={signer.role}
                    label={`Signature ${index + 1}`}
                    signerRole={signer.role}
                    required={signer.is_mandatory}
                    value={signatures[signer.role] || null}
                    onChange={(sig) => handleSignatureChange(signer.role, sig)}
                    disabled={!canEdit || (
                      !activeTemplate.allow_parallel_signing && 
                      index > 0 && 
                      !signatures[requiredSigners[index - 1].role]
                    )}
                  />
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FormSubmissionPage;
