import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDocumentCategories, useDocumentMutations } from '@/hooks/useDocuments';
import { useVessels } from '@/hooks/useVessels';
import { useAuth } from '@/contexts/AuthContext';
import {
  useReviewers,
  useApprovers,
  useExistingTags,
  useCheckDocumentNumber,
  useDocumentWorkflowMutations,
} from '@/hooks/useDocumentWorkflow';
import { LANGUAGES, ISM_SECTIONS } from '@/lib/documentConstants';
import { format, addYears, differenceInDays } from 'date-fns';
import {
  CalendarIcon,
  Upload,
  X,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface UploadDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WorkflowOption = 'draft' | 'review' | 'approve';

const getFileIcon = (fileType: string) => {
  if (fileType.includes('pdf')) return FileText;
  if (fileType.includes('spreadsheet') || fileType.includes('xlsx')) return FileSpreadsheet;
  if (fileType.includes('image')) return FileImage;
  return File;
};

const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { profile } = useAuth();
  const { data: categories = [] } = useDocumentCategories();
  const { vessels = [] } = useVessels();
  const { uploadDocument } = useDocumentMutations();
  const { data: reviewers = [] } = useReviewers();
  const { data: approvers = [] } = useApprovers();
  const { data: existingTags = [] } = useExistingTags();
  const checkDocumentNumber = useCheckDocumentNumber();
  const { submitForReview, approveImmediately } = useDocumentWorkflowMutations();

  // Multi-step state
  const [step, setStep] = useState(1);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Step 1: File
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Step 2: Document details
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentNumberError, setDocumentNumberError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [scope, setScope] = useState<'company' | 'vessel'>('company');
  const [vesselId, setVesselId] = useState('');
  const [revision, setRevision] = useState('Rev 1');
  const [language, setLanguage] = useState('EN');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [isMandatoryRead, setIsMandatoryRead] = useState(false);
  const [ismSections, setIsmSections] = useState<number[]>([]);
  const [nextReviewDate, setNextReviewDate] = useState<Date | undefined>(addYears(new Date(), 1));

  // Step 3: Workflow
  const [workflowOption, setWorkflowOption] = useState<WorkflowOption>('draft');
  const [reviewerId, setReviewerId] = useState('');
  const [approverId, setApproverId] = useState('');
  const [reviewComments, setReviewComments] = useState('');

  const canApproveImmediately = profile?.role === 'dpa' || profile?.role === 'shore_management';

  // Generate document number suggestion when category changes
  useEffect(() => {
    if (categoryId && !documentNumber) {
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        const prefix = category.name.substring(0, 3).toUpperCase();
        const year = new Date().getFullYear();
        setDocumentNumber(`DOC-${prefix}-${year}-001`);
      }
    }
  }, [categoryId, categories, documentNumber]);

  // Validate document number uniqueness
  useEffect(() => {
    if (documentNumber) {
      const timeoutId = setTimeout(async () => {
        const result = await checkDocumentNumber.mutateAsync(documentNumber);
        if (result.exists) {
          setDocumentNumberError('This document number already exists');
        } else {
          setDocumentNumberError('');
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [documentNumber]);

  // Filter tag suggestions
  useEffect(() => {
    if (tagInput.trim()) {
      const filtered = existingTags.filter(
        (tag) =>
          tag.toLowerCase().includes(tagInput.toLowerCase()) &&
          !tags.includes(tag)
      );
      setTagSuggestions(filtered.slice(0, 5));
    } else {
      setTagSuggestions([]);
    }
  }, [tagInput, existingTags, tags]);

  const resetForm = () => {
    setStep(1);
    setFile(null);
    setDocumentNumber('');
    setDocumentNumberError('');
    setTitle('');
    setDescription('');
    setCategoryId('');
    setScope('company');
    setVesselId('');
    setRevision('Rev 1');
    setLanguage('EN');
    setTagInput('');
    setTags([]);
    setIsMandatoryRead(false);
    setIsmSections([]);
    setNextReviewDate(addYears(new Date(), 1));
    setWorkflowOption('draft');
    setReviewerId('');
    setApproverId('');
    setReviewComments('');
    setUploadProgress(0);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
        if (!title) {
          setTitle(droppedFile.name.replace(/\.[^/.]+$/, ''));
        }
      }
    }
  }, [title]);

  const validateFile = (file: File): boolean => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
    ];
    const maxSize = 25 * 1024 * 1024; // 25MB

    if (!allowedTypes.includes(file.type)) {
      return false;
    }
    if (file.size > maxSize) {
      return false;
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
        if (!title) {
          setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
        }
      }
    }
  };

  const handleAddTag = (tagToAdd: string) => {
    const trimmedTag = tagToAdd.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
    }
    setTagInput('');
    setTagSuggestions([]);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleIsmSectionToggle = (section: number) => {
    setIsmSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const handleSubmit = async () => {
    if (!file || !title || !categoryId || !documentNumber) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const status = workflowOption === 'approve' ? 'Approved' : 'Draft';

      const result = await uploadDocument.mutateAsync({
        file,
        title,
        description: description || undefined,
        category_id: categoryId,
        vessel_id: scope === 'vessel' ? vesselId : null,
        revision,
        language,
        status,
        tags,
        is_mandatory_read: isMandatoryRead,
        ism_sections: ismSections,
        next_review_date: nextReviewDate ? format(nextReviewDate, 'yyyy-MM-dd') : null,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Handle workflow actions
      if (workflowOption === 'review' && reviewerId && approverId) {
        await submitForReview.mutateAsync({
          documentId: result.id,
          reviewerId,
          approverId,
          comments: reviewComments,
        });
      }

      setTimeout(() => {
        handleClose();
      }, 500);
    } catch (error) {
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const FileIcon = file ? getFileIcon(file.type) : Upload;

  const isStep1Valid = !!file;
  const isStep2Valid = !!title && !!categoryId && !!documentNumber && !documentNumberError;
  const isStep3Valid =
    workflowOption === 'draft' ||
    workflowOption === 'approve' ||
    (workflowOption === 'review' && !!reviewerId && !!approverId);

  const reviewDaysFromNow = nextReviewDate
    ? differenceInDays(nextReviewDate, new Date())
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[95vh] p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center justify-between">
            <span>Upload Document</span>
            <div className="flex items-center gap-2 text-sm font-normal">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'flex items-center gap-1',
                    s === step ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                      s < step
                        ? 'bg-primary text-primary-foreground'
                        : s === step
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {s < step ? <Check className="w-3 h-3" /> : s}
                  </div>
                  <span className="hidden sm:inline">
                    {s === 1 ? 'File' : s === 2 ? 'Details' : 'Workflow'}
                  </span>
                  {s < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Upload Progress */}
        {isUploading && (
          <div className="px-6 py-2">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1 text-center">
              Uploading... {uploadProgress}%
            </p>
          </div>
        )}

        <ScrollArea className="max-h-[calc(95vh-180px)]">
          <div className="p-6 pt-4">
            {/* Step 1: File Upload */}
            {step === 1 && (
              <div className="space-y-6">
                <div
                  className={cn(
                    'border-2 border-dashed rounded-xl p-12 text-center transition-all',
                    dragActive
                      ? 'border-primary bg-primary/5 scale-[1.02]'
                      : 'border-border hover:border-primary/50',
                    file ? 'bg-muted/50' : ''
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {file ? (
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                        <FileIcon className="w-8 h-8 text-primary" />
                      </div>
                      <p className="font-semibold text-lg text-foreground">{file.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFile(null)}
                        className="mt-4 text-destructive hover:text-destructive"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Remove file
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-2">
                        Drag and drop your file here
                      </p>
                      <p className="text-muted-foreground mb-4">or</p>
                      <label className="inline-flex">
                        <Button type="button" variant="secondary">
                          Browse files
                        </Button>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                          onChange={handleFileChange}
                        />
                      </label>
                      <p className="text-xs text-muted-foreground mt-6">
                        Supported formats: PDF, DOCX, XLSX, PNG, JPG (max 25MB)
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Document Details */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="documentNumber">Document Number *</Label>
                    <Input
                      id="documentNumber"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="DOC-POL-2026-001"
                      className={documentNumberError ? 'border-destructive' : ''}
                    />
                    {documentNumberError && (
                      <p className="text-xs text-destructive mt-1">{documentNumberError}</p>
                    )}
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <Label>Category *</Label>
                    <Select value={categoryId} onValueChange={setCategoryId}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter document title"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the document"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label>Revision</Label>
                    <Input
                      value={revision}
                      onChange={(e) => setRevision(e.target.value)}
                      placeholder="Rev 1"
                    />
                  </div>

                  <div>
                    <Label>Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Scope */}
                <div>
                  <Label className="mb-3 block">Document Scope</Label>
                  <RadioGroup
                    value={scope}
                    onValueChange={(v) => setScope(v as 'company' | 'vessel')}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="company" id="scope-company" />
                      <Label htmlFor="scope-company" className="cursor-pointer font-normal">
                        Company-wide
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="vessel" id="scope-vessel" />
                      <Label htmlFor="scope-vessel" className="cursor-pointer font-normal">
                        Vessel-specific
                      </Label>
                    </div>
                  </RadioGroup>
                  {scope === 'vessel' && (
                    <Select value={vesselId} onValueChange={setVesselId}>
                      <SelectTrigger className="bg-background mt-3">
                        <SelectValue placeholder="Select vessel" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {vessels.map((vessel) => (
                          <SelectItem key={vessel.id} value={vessel.id}>
                            {vessel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* ISM Sections */}
                <div>
                  <Label className="mb-3 block">ISM Code Sections</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                    {ISM_SECTIONS.map((section) => (
                      <div key={section.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`ism-${section.value}`}
                          checked={ismSections.includes(section.value)}
                          onCheckedChange={() => handleIsmSectionToggle(section.value)}
                        />
                        <Label
                          htmlFor={`ism-${section.value}`}
                          className="text-sm cursor-pointer font-normal"
                        >
                          {section.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                  <div className="relative">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder="Type a tag and press Enter"
                    />
                    {tagSuggestions.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md">
                        {tagSuggestions.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => handleAddTag(tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mandatory Read and Review Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Next Review Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !nextReviewDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {nextReviewDate ? format(nextReviewDate, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-popover" align="start">
                        <Calendar
                          mode="single"
                          selected={nextReviewDate}
                          onSelect={setNextReviewDate}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    {reviewDaysFromNow !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Review due in {reviewDaysFromNow} days
                      </p>
                    )}
                  </div>

                  <div className="flex items-end">
                    <div className="flex items-center space-x-2 p-3 border rounded-lg w-full">
                      <Checkbox
                        id="mandatory-read"
                        checked={isMandatoryRead}
                        onCheckedChange={(checked) => setIsMandatoryRead(checked as boolean)}
                      />
                      <Label htmlFor="mandatory-read" className="cursor-pointer text-sm font-normal">
                        Mark as mandatory read
                      </Label>
                    </div>
                  </div>
                </div>

                {isMandatoryRead && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      All crew members will be required to acknowledge reading this document.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Step 3: Workflow */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <Label className="mb-4 block text-lg font-medium">
                    What would you like to do with this document?
                  </Label>
                  <RadioGroup
                    value={workflowOption}
                    onValueChange={(v) => setWorkflowOption(v as WorkflowOption)}
                    className="space-y-3"
                  >
                    <div
                      className={cn(
                        'flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors',
                        workflowOption === 'draft' ? 'border-primary bg-primary/5' : 'border-border'
                      )}
                      onClick={() => setWorkflowOption('draft')}
                    >
                      <RadioGroupItem value="draft" id="workflow-draft" className="mt-1" />
                      <div>
                        <Label htmlFor="workflow-draft" className="cursor-pointer font-medium">
                          Save as Draft
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Save without notifications. You can submit for review later.
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors',
                        workflowOption === 'review' ? 'border-primary bg-primary/5' : 'border-border'
                      )}
                      onClick={() => setWorkflowOption('review')}
                    >
                      <RadioGroupItem value="review" id="workflow-review" className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor="workflow-review" className="cursor-pointer font-medium">
                          Submit for Review
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Send to a reviewer and approver for sign-off.
                        </p>
                      </div>
                    </div>

                    {canApproveImmediately && (
                      <div
                        className={cn(
                          'flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors',
                          workflowOption === 'approve'
                            ? 'border-primary bg-primary/5'
                            : 'border-border'
                        )}
                        onClick={() => setWorkflowOption('approve')}
                      >
                        <RadioGroupItem value="approve" id="workflow-approve" className="mt-1" />
                        <div>
                          <Label htmlFor="workflow-approve" className="cursor-pointer font-medium">
                            Approve Immediately
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Approve and publish the document now.
                          </p>
                        </div>
                      </div>
                    )}
                  </RadioGroup>
                </div>

                {/* Review workflow details */}
                {workflowOption === 'review' && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Reviewer *</Label>
                        <Select value={reviewerId} onValueChange={setReviewerId}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select reviewer" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            {reviewers.map((r) => (
                              <SelectItem key={r.user_id} value={r.user_id}>
                                {r.first_name} {r.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Approver *</Label>
                        <Select value={approverId} onValueChange={setApproverId}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select approver" />
                          </SelectTrigger>
                          <SelectContent className="bg-popover">
                            {approvers.map((a) => (
                              <SelectItem key={a.user_id} value={a.user_id}>
                                {a.first_name} {a.last_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label>Comments for Reviewer</Label>
                      <Textarea
                        value={reviewComments}
                        onChange={(e) => setReviewComments(e.target.value)}
                        placeholder="Optional comments or instructions for the reviewer"
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-border bg-muted/30">
          <div>
            {step > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(step - 1)}
                disabled={isUploading}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isUploading}>
              Cancel
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!isStep3Valid || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : workflowOption === 'draft' ? (
                  'Save Draft'
                ) : workflowOption === 'review' ? (
                  'Submit for Review'
                ) : (
                  'Approve & Publish'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UploadDocumentModal;
