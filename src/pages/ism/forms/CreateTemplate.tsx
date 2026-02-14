import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Upload, FileText, Wand2, Save, ArrowLeft, ArrowRight,
  Plus, Trash2, GripVertical, Settings, Check, Loader2,
  X
} from 'lucide-react';
import FieldEditor from '@/components/forms/FieldEditor';

// Step definitions
const STEPS = [
  { id: 'upload', label: 'Upload Source', icon: Upload },
  { id: 'extract', label: 'AI Extraction', icon: Wand2 },
  { id: 'edit', label: 'Edit Fields', icon: Settings },
  { id: 'configure', label: 'Configure', icon: FileText },
  { id: 'review', label: 'Review & Publish', icon: Check }
];

// Field type definitions
const FIELD_TYPES = [
  { value: 'text', label: 'Text Input', icon: '📝' },
  { value: 'textarea', label: 'Text Area', icon: '📄' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { value: 'yes_no', label: 'Yes / No', icon: '✓✗' },
  { value: 'yes_no_na', label: 'Yes / No / N/A', icon: '✓✗−' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'datetime', label: 'Date & Time', icon: '🕐' },
  { value: 'time', label: 'Time Only', icon: '⏰' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'dropdown', label: 'Dropdown', icon: '▼' },
  { value: 'signature', label: 'Signature', icon: '✍️' },
  { value: 'table', label: 'Table Grid', icon: '▦' },
  { value: 'file', label: 'File Upload', icon: '📎' },
  { value: 'section', label: 'Section Header', icon: '§' }
];

const FORM_TYPES = [
  { value: 'CHECKLIST', label: 'Checklist' },
  { value: 'REPORT', label: 'Report' },
  { value: 'MEETING_MINUTES', label: 'Meeting Minutes' },
  { value: 'DRILL_REPORT', label: 'Drill Report' },
  { value: 'HANDOVER', label: 'Handover' },
  { value: 'AUDIT_FORM', label: 'Audit Form' },
  { value: 'RISK_ASSESSMENT', label: 'Risk Assessment' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'PERMIT_TO_WORK', label: 'Permit to Work' }
];

export interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  conditionalOn?: {
    fieldId: string;
    value: string;
  };
  tableConfig?: {
    columns: Array<{ id: string; label: string; type: string }>;
    minRows?: number;
    maxRows?: number;
  };
}

interface RequiredSigner {
  role: string;
  order: number;
  signature_type: string;
  is_mandatory: boolean;
}

interface TemplateData {
  template_code: string;
  template_name: string;
  description: string;
  form_type: string;
  vessel_scope: string;
  department_scope: string;
  initiation_mode: string;
  has_expiry: boolean;
  expiry_hours?: number;
  allow_line_items: boolean;
  required_signers: RequiredSigner[];
  allow_parallel_signing: boolean;
  source_file_url?: string;
  source_file_name?: string;
  source_file_type?: string;
  form_schema: {
    pages: any[];
    fields: FormField[];
    layout: any;
  };
}

const CreateTemplate: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractionComplete, setExtractionComplete] = useState(false);
  
  const [templateData, setTemplateData] = useState<TemplateData>({
    template_code: '',
    template_name: '',
    description: '',
    form_type: 'CHECKLIST',
    vessel_scope: 'FLEET',
    department_scope: 'ALL',
    initiation_mode: 'MANUAL',
    has_expiry: false,
    allow_line_items: true,
    required_signers: [],
    allow_parallel_signing: false,
    form_schema: { pages: [], fields: [], layout: {} }
  });

  // File upload handler
  const handleFileUpload = useCallback(async (file: File) => {
    setUploadedFile(file);
    
    // Generate preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (file.type === 'application/pdf') {
        setPreviewUrl(e.target?.result as string);
      }
    };
    reader.readAsDataURL(file);

    // Upload to storage
    const fileExt = file.name.split('.').pop();
    const filePath = `form-templates/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      setTemplateData(prev => ({
        ...prev,
        source_file_url: urlData.publicUrl,
        source_file_name: file.name,
        source_file_type: fileExt?.toUpperCase()
      }));

      // Auto-populate name from filename
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTemplateData(prev => ({
        ...prev,
        template_name: prev.template_name || baseName,
        template_code: prev.template_code || baseName.toUpperCase().replace(/\s+/g, '_').substring(0, 20)
      }));
    }
  }, []);

  // Convert uploaded file to base64 for AI extraction
  const getFileBase64 = (): Promise<{ base64: string; mimeType: string } | null> => {
    return new Promise((resolve) => {
      if (!uploadedFile) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const commaIndex = dataUrl.indexOf(',');
        const base64 = dataUrl.substring(commaIndex + 1);
        const mimeType = dataUrl.substring(5, dataUrl.indexOf(';'));
        resolve({ base64, mimeType });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(uploadedFile);
    });
  };

  // AI Extraction handler
  const handleAIExtraction = async () => {
    if (!templateData.source_file_url && !uploadedFile) return;
    
    setIsProcessing(true);

    try {
      // Get file as base64 for multimodal AI analysis
      const fileData = await getFileBase64();

      const requestBody: Record<string, any> = {
        file_url: templateData.source_file_url,
        file_type: templateData.source_file_type,
        template_name: templateData.template_name,
      };

      if (fileData) {
        requestBody.file_base64 = fileData.base64;
        requestBody.file_mime_type = fileData.mimeType;
      }

      // Call AI extraction edge function
      const { data, error } = await supabase.functions.invoke('extract-form-fields', {
        body: requestBody
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success) {
        setTemplateData(prev => ({
          ...prev,
          template_name: data.document_title || prev.template_name,
          description: data.document_description || prev.description,
          form_schema: {
            ...prev.form_schema,
            fields: data.extracted_fields || [],
            pages: data.pages || []
          }
        }));
        setExtractionComplete(true);
        toast({
          title: "Extraction Complete",
          description: `Found ${data.extracted_fields?.length || 0} fields with ${Math.round((data.extraction_confidence || 0.7) * 100)}% confidence`,
        });
      } else {
        throw new Error('Extraction returned no data');
      }
    } catch (error: any) {
      console.error('AI extraction failed:', error);
      toast({
        title: "Extraction Failed",
        description: error?.message || "AI extraction unavailable. You can add fields manually.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual extraction fallback
  const handleManualCreation = () => {
    setTemplateData(prev => ({
      ...prev,
      form_schema: {
        ...prev.form_schema,
        fields: [],
        pages: [{ id: 'page_1', number: 1, fields: [] }]
      }
    }));
    setCurrentStep(2); // Skip to edit fields step
  };

  // Add new field
  const addField = (type: string = 'text') => {
    const newField: FormField = {
      id: `field_${Date.now()}`,
      type,
      label: `New ${FIELD_TYPES.find(t => t.value === type)?.label || 'Field'}`,
      required: false
    };

    if (type === 'dropdown') {
      newField.options = ['Option 1', 'Option 2', 'Option 3'];
    }

    if (type === 'table') {
      newField.tableConfig = {
        columns: [
          { id: 'col_1', label: 'Column 1', type: 'text' },
          { id: 'col_2', label: 'Column 2', type: 'text' }
        ],
        minRows: 1
      };
    }

    setTemplateData(prev => ({
      ...prev,
      form_schema: {
        ...prev.form_schema,
        fields: [...prev.form_schema.fields, newField]
      }
    }));
  };

  // Update field
  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    setTemplateData(prev => ({
      ...prev,
      form_schema: {
        ...prev.form_schema,
        fields: prev.form_schema.fields.map(f =>
          f.id === fieldId ? { ...f, ...updates } : f
        )
      }
    }));
  };

  // Delete field
  const deleteField = (fieldId: string) => {
    setTemplateData(prev => ({
      ...prev,
      form_schema: {
        ...prev.form_schema,
        fields: prev.form_schema.fields.filter(f => f.id !== fieldId)
      }
    }));
  };

  // Move field
  const moveField = (fromIndex: number, toIndex: number) => {
    setTemplateData(prev => {
      const fields = [...prev.form_schema.fields];
      const [moved] = fields.splice(fromIndex, 1);
      fields.splice(toIndex, 0, moved);
      return {
        ...prev,
        form_schema: { ...prev.form_schema, fields }
      };
    });
  };

  // Add signer
  const addSigner = () => {
    setTemplateData(prev => ({
      ...prev,
      required_signers: [
        ...prev.required_signers,
        {
          role: '',
          order: prev.required_signers.length + 1,
          signature_type: 'TYPED',
          is_mandatory: true
        }
      ]
    }));
  };

  // Remove signer
  const removeSigner = (index: number) => {
    setTemplateData(prev => ({
      ...prev,
      required_signers: prev.required_signers.filter((_, i) => i !== index)
    }));
  };

  // Save template
  const saveTemplate = async (publish: boolean = false) => {
    if (!templateData.template_code || !templateData.template_name) {
      toast({
        title: "Validation Error",
        description: "Template code and name are required",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      const insertData: Record<string, unknown> = {
        template_code: templateData.template_code,
        template_name: templateData.template_name,
        description: templateData.description,
        form_type: templateData.form_type,
        vessel_scope: templateData.vessel_scope,
        department_scope: templateData.department_scope,
        initiation_mode: templateData.initiation_mode,
        has_expiry: templateData.has_expiry,
        expiry_hours: templateData.expiry_hours,
        allow_line_items: templateData.allow_line_items,
        required_signers: templateData.required_signers as unknown as import('@/integrations/supabase/types').Json,
        allow_parallel_signing: templateData.allow_parallel_signing,
        source_file_url: templateData.source_file_url,
        source_file_name: templateData.source_file_name,
        source_file_type: templateData.source_file_type,
        form_schema: templateData.form_schema as unknown as import('@/integrations/supabase/types').Json,
        status: publish ? 'PUBLISHED' : 'DRAFT',
        published_at: publish ? new Date().toISOString() : null,
        created_by: user?.id
      };

      const { data, error } = await supabase
        .from('form_templates')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: publish ? "Template Published" : "Template Saved",
        description: `${templateData.template_name} has been ${publish ? 'published' : 'saved as draft'}`,
      });

      navigate(`/ism/forms/templates/${data.id}`);
    } catch (error) {
      console.error('Failed to save template:', error);
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Navigate between steps
  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Upload
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Upload Source Document</h2>
              <p className="text-muted-foreground">Upload a PDF or Word document to convert into a digital form</p>
            </div>

            <Card
              className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              <CardContent className="flex flex-col items-center justify-center py-12">
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.doc"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                
                {uploadedFile ? (
                  <div className="text-center">
                    <FileText className="h-12 w-12 text-primary mx-auto mb-4" />
                    <p className="font-medium">{uploadedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <Button
                      variant="link"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="mt-4 text-destructive"
                    >
                      Remove and upload different file
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="font-medium">Drop your file here or click to browse</p>
                    <p className="text-sm text-muted-foreground">Supports PDF and DOCX files up to 25MB</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="text-center">
              <p className="text-muted-foreground mb-2">Or create a form from scratch</p>
              <Button variant="outline" onClick={handleManualCreation}>
                Create blank template →
              </Button>
            </div>
          </div>
        );

      case 1: // AI Extraction
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">AI-Assisted Field Extraction</h2>
              <p className="text-muted-foreground">Our AI will analyze your document and suggest form fields</p>
            </div>

            {extractionComplete ? (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 text-green-700">
                    <Check className="h-6 w-6" />
                    <span className="font-medium">Extraction Complete</span>
                  </div>
                  <p className="mt-2 text-sm text-green-600">
                    Found {templateData.form_schema.fields.length} fields across {templateData.form_schema.pages.length || 1} pages
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                      <p className="font-medium">Analyzing document...</p>
                      <p className="text-sm text-muted-foreground">This may take a moment</p>
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-12 w-12 text-primary mb-4" />
                      <p className="font-medium">Ready to extract form fields</p>
                      <Button className="mt-4" onClick={handleAIExtraction}>
                        Start AI Extraction
                      </Button>
                      <p className="text-sm text-muted-foreground mt-4">
                        Or{' '}
                        <button
                          onClick={() => setCurrentStep(2)}
                          className="text-primary hover:underline"
                        >
                          skip and add fields manually
                        </button>
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 2: // Edit Fields
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Edit Form Fields</h2>
                <p className="text-muted-foreground">Customize the extracted fields or add new ones</p>
              </div>
              
              <Select onValueChange={(value) => addField(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Add Field..." />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fields List */}
            <div className="space-y-3">
              {templateData.form_schema.fields.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No fields yet. Add your first field above.</p>
                  </CardContent>
                </Card>
              ) : (
                templateData.form_schema.fields.map((field, index) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    index={index}
                    totalFields={templateData.form_schema.fields.length}
                    allFields={templateData.form_schema.fields}
                    onUpdate={(updates) => updateField(field.id, updates)}
                    onDelete={() => deleteField(field.id)}
                    onMove={moveField}
                  />
                ))
              )}
            </div>
          </div>
        );

      case 3: // Configure
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Template Configuration</h2>

            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Template Code *</Label>
                    <Input
                      value={templateData.template_code}
                      onChange={(e) => setTemplateData(prev => ({ 
                        ...prev, 
                        template_code: e.target.value.toUpperCase().replace(/\s+/g, '_') 
                      }))}
                      placeholder="e.g., PRE_DEP_CHECK"
                    />
                  </div>
                  <div>
                    <Label>Form Type *</Label>
                    <Select
                      value={templateData.form_type}
                      onValueChange={(value) => setTemplateData(prev => ({ ...prev, form_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Template Name *</Label>
                  <Input
                    value={templateData.template_name}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, template_name: e.target.value }))}
                    placeholder="e.g., Pre-Departure Safety Checklist"
                  />
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={templateData.description}
                    onChange={(e) => setTemplateData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    placeholder="Brief description of this form's purpose..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Scope */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scope & Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Vessel Scope</Label>
                    <Select
                      value={templateData.vessel_scope}
                      onValueChange={(value) => setTemplateData(prev => ({ ...prev, vessel_scope: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FLEET">Fleet-wide (All Vessels)</SelectItem>
                        <SelectItem value="VESSEL_SPECIFIC">Specific Vessels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Department</Label>
                    <Select
                      value={templateData.department_scope}
                      onValueChange={(value) => setTemplateData(prev => ({ ...prev, department_scope: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Departments</SelectItem>
                        <SelectItem value="DECK">Deck</SelectItem>
                        <SelectItem value="ENGINE">Engine</SelectItem>
                        <SelectItem value="INTERIOR">Interior</SelectItem>
                        <SelectItem value="GALLEY">Galley</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Initiation Mode</Label>
                  <Select
                    value={templateData.initiation_mode}
                    onValueChange={(value) => setTemplateData(prev => ({ ...prev, initiation_mode: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANUAL">Manual Only</SelectItem>
                      <SelectItem value="SCHEDULED">Scheduled Only</SelectItem>
                      <SelectItem value="BOTH">Both Manual & Scheduled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Expiry */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Expiry Settings</CardTitle>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={templateData.has_expiry}
                      onCheckedChange={(checked) => setTemplateData(prev => ({ ...prev, has_expiry: checked }))}
                    />
                    <Label className="text-sm">Enable expiry</Label>
                  </div>
                </div>
              </CardHeader>
              {templateData.has_expiry && (
                <CardContent>
                  <div>
                    <Label>Expires after (hours)</Label>
                    <Input
                      type="number"
                      value={templateData.expiry_hours || ''}
                      onChange={(e) => setTemplateData(prev => ({ ...prev, expiry_hours: parseInt(e.target.value) }))}
                      placeholder="24"
                    />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Signatures */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Required Signatures</CardTitle>
                  <Button variant="outline" size="sm" onClick={addSigner}>
                    <Plus className="h-4 w-4 mr-1" /> Add Signer
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {templateData.required_signers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No signatures required. Add signers for audit-grade forms.</p>
                ) : (
                  <div className="space-y-3">
                    {templateData.required_signers.map((signer, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <span className="text-sm text-muted-foreground">#{signer.order}</span>
                        <Select
                          value={signer.role}
                          onValueChange={(value) => {
                            const updated = [...templateData.required_signers];
                            updated[index].role = value;
                            setTemplateData(prev => ({ ...prev, required_signers: updated }));
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select Role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Captain">Captain</SelectItem>
                            <SelectItem value="Chief_Officer">Chief Officer</SelectItem>
                            <SelectItem value="Chief_Engineer">Chief Engineer</SelectItem>
                            <SelectItem value="Officer">Officer</SelectItem>
                            <SelectItem value="Crew">Crew Member</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={signer.signature_type}
                          onValueChange={(value) => {
                            const updated = [...templateData.required_signers];
                            updated[index].signature_type = value;
                            setTemplateData(prev => ({ ...prev, required_signers: updated }));
                          }}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TYPED">Typed</SelectItem>
                            <SelectItem value="DRAWN">Drawn</SelectItem>
                            <SelectItem value="PIN">PIN</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" onClick={() => removeSigner(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      case 4: // Review
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Review & Publish</h2>

            <Card>
              <CardHeader>
                <CardTitle>{templateData.template_name || 'Untitled Template'}</CardTitle>
                <CardDescription>{templateData.template_code}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Form Type:</span>
                    <span className="ml-2 font-medium">{FORM_TYPES.find(t => t.value === templateData.form_type)?.label}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vessel Scope:</span>
                    <span className="ml-2 font-medium">{templateData.vessel_scope === 'FLEET' ? 'Fleet-wide' : 'Specific Vessels'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Department:</span>
                    <span className="ml-2 font-medium">{templateData.department_scope}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Initiation:</span>
                    <span className="ml-2 font-medium">{templateData.initiation_mode}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fields:</span>
                    <span className="ml-2 font-medium">{templateData.form_schema.fields.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Required Signers:</span>
                    <span className="ml-2 font-medium">{templateData.required_signers.length}</span>
                  </div>
                </div>

                {templateData.description && (
                  <div>
                    <span className="text-sm text-muted-foreground">Description:</span>
                    <p className="text-sm mt-1">{templateData.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => saveTemplate(false)}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save as Draft
              </Button>
              <Button
                className="flex-1"
                onClick={() => saveTemplate(true)}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Publish Template
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Create Form Template</h1>
            <p className="text-muted-foreground">Convert documents into digital forms with AI assistance</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/ism/forms/templates')}>
            Cancel
          </Button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isComplete = index < currentStep;
            const isCurrent = index === currentStep;
            
            return (
              <React.Fragment key={step.id}>
                <div 
                  className={`flex flex-col items-center gap-2 cursor-pointer ${
                    isCurrent ? 'text-primary' : isComplete ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                  onClick={() => index < currentStep && setCurrentStep(index)}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                    isCurrent ? 'border-primary bg-primary/10' : 
                    isComplete ? 'border-primary bg-primary/20' : 'border-muted'
                  }`}>
                    {isComplete ? <Check className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                  </div>
                  <span className="text-xs font-medium hidden sm:block">{step.label}</span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${
                    index < currentStep ? 'bg-primary' : 'bg-muted'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="pt-6">
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          {currentStep < STEPS.length - 1 && (
            <Button onClick={nextStep}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreateTemplate;
