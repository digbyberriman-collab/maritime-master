import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, Edit, Copy, Archive, Play, Calendar, 
  Clock, CheckCircle, Users, Loader2
} from 'lucide-react';
import { useFormTemplate, useDuplicateFormTemplate, useArchiveFormTemplate } from '@/hooks/useFormTemplates';
import { 
  getFormTypeInfo, 
  getTemplateStatusConfig,
  getFieldTypeInfo,
  VESSEL_SCOPE_OPTIONS,
  DEPARTMENT_SCOPE_OPTIONS,
  INITIATION_MODE_OPTIONS,
  type FormSchema,
  type RequiredSigner
} from '@/lib/formConstants';
import type { Json } from '@/integrations/supabase/types';

const TemplateDetail: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const { data: template, isLoading, error } = useFormTemplate(templateId || null);
  const duplicateMutation = useDuplicateFormTemplate();
  const archiveMutation = useArchiveFormTemplate();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !template) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-medium">Template Not Found</h3>
            <p className="text-muted-foreground text-sm mt-1">
              The template you're looking for doesn't exist or has been removed.
            </p>
            <Button className="mt-4" onClick={() => navigate('/ism/forms/templates')}>
              Back to Templates
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const typeInfo = getFormTypeInfo(template.form_type);
  const statusConfig = getTemplateStatusConfig(template.status);
  const schema = template.form_schema as unknown as FormSchema;
  const requiredSigners = (template.required_signers as unknown as RequiredSigner[]) || [];

  const vesselScopeLabel = VESSEL_SCOPE_OPTIONS.find(o => o.value === template.vessel_scope)?.label || template.vessel_scope;
  const deptScopeLabel = DEPARTMENT_SCOPE_OPTIONS.find(o => o.value === template.department_scope)?.label || template.department_scope;
  const initiationLabel = INITIATION_MODE_OPTIONS.find(o => o.value === template.initiation_mode)?.label || template.initiation_mode;

  const handleDuplicate = async () => {
    const result = await duplicateMutation.mutateAsync(template.id);
    navigate(`/ism/forms/templates/${result.id}/edit`);
  };

  const handleArchive = async () => {
    await archiveMutation.mutateAsync(template.id);
    navigate('/ism/forms/templates');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/ism/forms/templates')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{typeInfo.icon}</span>
                <h1 className="text-2xl font-bold text-foreground">{template.template_name}</h1>
                <Badge variant="outline" className={statusConfig.color}>
                  {statusConfig.label}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm mt-1">{template.template_code} • v{template.version}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {template.status === 'PUBLISHED' && (
              <Button onClick={() => navigate(`/ism/forms/new?template=${template.id}`)}>
                <Play className="h-4 w-4 mr-2" />
                Start Form
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(`/ism/forms/templates/${template.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button 
              variant="outline" 
              onClick={handleDuplicate}
              disabled={duplicateMutation.isPending}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </Button>
            {template.status !== 'ARCHIVED' && (
              <Button 
                variant="outline" 
                onClick={handleArchive}
                disabled={archiveMutation.isPending}
              >
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </Button>
            )}
          </div>
        </div>

        {/* Template Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Template Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {template.description && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                    <p className="mt-1">{template.description}</p>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Form Type</h4>
                    <p className="mt-1">{typeInfo.label}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Vessel Scope</h4>
                    <p className="mt-1">{vesselScopeLabel}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Department</h4>
                    <p className="mt-1">{deptScopeLabel}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Initiation</h4>
                    <p className="mt-1">{initiationLabel}</p>
                  </div>
                </div>

                {template.has_expiry && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 text-amber-600">
                      <Clock className="h-4 w-4" />
                      <span>Expires {template.expiry_hours} hours after creation</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Form Fields Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Form Fields ({schema?.fields?.length || 0})</CardTitle>
                <CardDescription>Fields configured in this template</CardDescription>
              </CardHeader>
              <CardContent>
                {schema?.fields?.length > 0 ? (
                  <div className="space-y-2">
                    {schema.fields.map((field, index) => {
                      const fieldTypeInfo = getFieldTypeInfo(field.type);
                      return (
                        <div 
                          key={field.id} 
                          className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                        >
                          <span className="text-lg">{fieldTypeInfo.icon}</span>
                          <div className="flex-1">
                            <p className="font-medium">{field.label}</p>
                            <p className="text-sm text-muted-foreground">{fieldTypeInfo.label}</p>
                          </div>
                          {field.required && (
                            <Badge variant="outline" className="text-destructive border-destructive">
                              Required
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No fields configured</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Required Signers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Required Signatures
                </CardTitle>
              </CardHeader>
              <CardContent>
                {requiredSigners.length > 0 ? (
                  <div className="space-y-3">
                    {requiredSigners.map((signer, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium">
                          {signer.order}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium capitalize">{signer.role.replace('_', ' ')}</p>
                          <p className="text-xs text-muted-foreground">
                            {signer.signature_type} • {signer.is_mandatory ? 'Required' : 'Optional'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No signatures required</p>
                )}
              </CardContent>
            </Card>

            {/* Workflow Integration */}
            <Card>
              <CardHeader>
                <CardTitle>Workflow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {template.can_trigger_incident && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Can trigger Incident</span>
                  </div>
                )}
                {template.can_trigger_nc && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Can trigger Non-Conformity</span>
                  </div>
                )}
                {template.can_trigger_capa && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Can trigger CAPA</span>
                  </div>
                )}
                {template.auto_attach_to_audit && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span>Auto-attach to Audits</span>
                  </div>
                )}
                {!template.can_trigger_incident && !template.can_trigger_nc && 
                 !template.can_trigger_capa && !template.auto_attach_to_audit && (
                  <p className="text-muted-foreground text-sm">No workflow integrations</p>
                )}
              </CardContent>
            </Card>

            {/* Source Document */}
            {template.source_file_url && (
              <Card>
                <CardHeader>
                  <CardTitle>Source Document</CardTitle>
                </CardHeader>
                <CardContent>
                  <a 
                    href={template.source_file_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    {template.source_file_name || 'View original document'}
                  </a>
                </CardContent>
              </Card>
            )}

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(template.created_at).toLocaleDateString()}</span>
                </div>
                {template.published_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Published</span>
                    <span>{new Date(template.published_at).toLocaleDateString()}</span>
                  </div>
                )}
                {template.effective_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Effective Date</span>
                    <span>{new Date(template.effective_date).toLocaleDateString()}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TemplateDetail;
