import React, { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, Upload, ChevronRight, ChevronLeft } from 'lucide-react';
import { format, differenceInMonths, differenceInYears } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCertificates, uploadCertificateFile, CertificateFormData } from '@/hooks/useCertificates';
import { useVessels } from '@/hooks/useVessels';
import { useCrew } from '@/hooks/useCrew';
import { useAuth } from '@/contexts/AuthContext';
import {
  CERTIFICATE_TYPES,
  getCategoryOptions,
  FLAG_STATES,
  CLASS_SOCIETIES,
  ALERT_THRESHOLDS,
} from '@/lib/certificateConstants';

interface AddCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: string;
}

const AddCertificateModal: React.FC<AddCertificateModalProps> = ({
  isOpen,
  onClose,
  defaultType = '',
}) => {
  const { profile } = useAuth();
  const { vessels } = useVessels();
  const { crew: crewMembers } = useCrew();
  const { addCertificate } = useCertificates();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    certificate_type: defaultType,
    certificate_category: '',
    certificate_number: '',
    certificate_name: '',
    issuing_authority: '',
    vessel_id: '',
    user_id: '',
    issue_date: undefined as Date | undefined,
    expiry_date: undefined as Date | undefined,
    next_survey_date: undefined as Date | undefined,
    alert_days: 90,
    notes: '',
    alertOptions: [90, 60, 30, 7, 0] as number[],
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFormData({
        certificate_type: defaultType,
        certificate_category: '',
        certificate_number: '',
        certificate_name: '',
        issuing_authority: '',
        vessel_id: '',
        user_id: '',
        issue_date: undefined,
        expiry_date: undefined,
        next_survey_date: undefined,
        alert_days: 90,
        notes: '',
        alertOptions: [90, 60, 30, 7, 0],
      });
      setUploadedFile(null);
    }
  }, [isOpen, defaultType]);

  // Update certificate name when category changes
  useEffect(() => {
    if (formData.certificate_category) {
      const categories = getCategoryOptions(formData.certificate_type);
      const selected = categories.find(c => c.value === formData.certificate_category);
      if (selected && !formData.certificate_name) {
        setFormData(prev => ({ ...prev, certificate_name: selected.label }));
      }
    }
  }, [formData.certificate_category, formData.certificate_type]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      setUploadedFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!formData.certificate_type || !formData.certificate_number || !formData.certificate_name || 
        !formData.issuing_authority || !formData.issue_date || !formData.expiry_date) {
      return;
    }

    setIsSubmitting(true);

    try {
      let fileUrl: string | null = null;

      // Upload file if provided
      if (uploadedFile && profile?.company_id) {
        fileUrl = await uploadCertificateFile(uploadedFile, profile.company_id);
      }

      const certificateData: CertificateFormData = {
        certificate_type: formData.certificate_type,
        certificate_category: formData.certificate_category || undefined,
        certificate_number: formData.certificate_number,
        certificate_name: formData.certificate_name,
        issuing_authority: formData.issuing_authority,
        vessel_id: formData.vessel_id || null,
        user_id: formData.user_id || null,
        issue_date: format(formData.issue_date, 'yyyy-MM-dd'),
        expiry_date: format(formData.expiry_date, 'yyyy-MM-dd'),
        next_survey_date: formData.next_survey_date ? format(formData.next_survey_date, 'yyyy-MM-dd') : null,
        file_url: fileUrl,
        alert_days: formData.alert_days,
        notes: formData.notes || null,
      };

      await addCertificate.mutateAsync(certificateData);
      onClose();
    } catch (error) {
      console.error('Error adding certificate:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getValidityPeriod = () => {
    if (!formData.issue_date || !formData.expiry_date) return '';
    const years = differenceInYears(formData.expiry_date, formData.issue_date);
    const months = differenceInMonths(formData.expiry_date, formData.issue_date) % 12;
    
    if (years > 0 && months > 0) {
      return `Valid for ${years} year${years > 1 ? 's' : ''} ${months} month${months > 1 ? 's' : ''}`;
    } else if (years > 0) {
      return `Valid for ${years} year${years > 1 ? 's' : ''}`;
    } else if (months > 0) {
      return `Valid for ${months} month${months > 1 ? 's' : ''}`;
    }
    return '';
  };

  const categoryOptions = getCategoryOptions(formData.certificate_type);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Add Certificate - Select Type' : 'Add Certificate - Details'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          /* Step 1: Certificate Type Selection */
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select the type of certificate you want to add:
            </p>
            <div className="grid grid-cols-1 gap-3">
              {CERTIFICATE_TYPES.map(type => (
                <Button
                  key={type.value}
                  variant={formData.certificate_type === type.value ? 'default' : 'outline'}
                  className="justify-between h-auto py-4"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, certificate_type: type.value }));
                    setStep(2);
                  }}
                >
                  <span className="font-medium">{type.label}</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ))}
            </div>
          </div>
        ) : (
          /* Step 2: Certificate Details */
          <div className="space-y-6 py-4">
            {/* Back button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(1)}
              className="mb-2"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to type selection
            </Button>

            {/* Category (if applicable) */}
            {categoryOptions.length > 0 && (
              <div className="space-y-2">
                <Label>Certificate Category</Label>
                <Select
                  value={formData.certificate_category}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, certificate_category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Certificate Name */}
            <div className="space-y-2">
              <Label>Certificate Name *</Label>
              <Input
                value={formData.certificate_name}
                onChange={(e) => setFormData(prev => ({ ...prev, certificate_name: e.target.value }))}
                placeholder="e.g., Safety Management Certificate"
              />
            </div>

            {/* Certificate Number */}
            <div className="space-y-2">
              <Label>Certificate Number *</Label>
              <Input
                value={formData.certificate_number}
                onChange={(e) => setFormData(prev => ({ ...prev, certificate_number: e.target.value }))}
                placeholder="Enter certificate number"
              />
            </div>

            {/* Issuing Authority */}
            <div className="space-y-2">
              <Label>Issuing Authority *</Label>
              <Select
                value={formData.issuing_authority}
                onValueChange={(v) => setFormData(prev => ({ ...prev, issuing_authority: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select issuing authority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__flag_header" disabled className="font-semibold">
                    Flag States
                  </SelectItem>
                  {FLAG_STATES.map(flag => (
                    <SelectItem key={flag} value={flag}>{flag}</SelectItem>
                  ))}
                  <SelectItem value="__class_header" disabled className="font-semibold border-t mt-2 pt-2">
                    Classification Societies
                  </SelectItem>
                  {CLASS_SOCIETIES.map(society => (
                    <SelectItem key={society} value={society}>{society}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vessel or Crew Selection */}
            {formData.certificate_type !== 'DOC' && formData.certificate_type !== 'Crew' && (
              <div className="space-y-2">
                <Label>Vessel</Label>
                <Select
                  value={formData.vessel_id}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, vessel_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vessel" />
                  </SelectTrigger>
                  <SelectContent>
                    {vessels?.map(vessel => (
                      <SelectItem key={vessel.id} value={vessel.id}>
                        {vessel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.certificate_type === 'Crew' && (
              <div className="space-y-2">
                <Label>Crew Member *</Label>
                <Select
                  value={formData.user_id}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, user_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select crew member" />
                  </SelectTrigger>
                  <SelectContent>
                    {crewMembers?.map(member => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.first_name} {member.last_name} ({member.rank || 'Crew'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Issue Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.issue_date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.issue_date ? format(formData.issue_date, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.issue_date}
                      onSelect={(date) => setFormData(prev => ({ ...prev, issue_date: date }))}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Expiry Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !formData.expiry_date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.expiry_date ? format(formData.expiry_date, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.expiry_date}
                      onSelect={(date) => setFormData(prev => ({ ...prev, expiry_date: date }))}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {getValidityPeriod() && (
                  <p className="text-xs text-muted-foreground">{getValidityPeriod()}</p>
                )}
              </div>
            </div>

            {/* Next Survey Date */}
            <div className="space-y-2">
              <Label>Next Survey Date (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !formData.next_survey_date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.next_survey_date ? format(formData.next_survey_date, 'PPP') : 'For annual/intermediate surveys'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.next_survey_date}
                    onSelect={(date) => setFormData(prev => ({ ...prev, next_survey_date: date }))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Upload Certificate (PDF/Image)</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                {uploadedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm text-foreground">{uploadedFile.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUploadedFile(null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Drag & drop or click to upload
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Max file size: 10MB
                    </p>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Alert Settings */}
            <div className="space-y-2">
              <Label>Alert me when:</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALERT_THRESHOLDS.map(threshold => (
                  <div key={threshold.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`alert-${threshold.value}`}
                      checked={formData.alertOptions.includes(threshold.value)}
                      onCheckedChange={(checked) => {
                        setFormData(prev => ({
                          ...prev,
                          alertOptions: checked
                            ? [...prev.alertOptions, threshold.value]
                            : prev.alertOptions.filter(v => v !== threshold.value),
                          alert_days: checked && threshold.value > prev.alert_days 
                            ? threshold.value 
                            : prev.alert_days,
                        }));
                      }}
                    />
                    <Label htmlFor={`alert-${threshold.value}`} className="text-sm font-normal">
                      {threshold.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add any additional notes..."
                rows={3}
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  !formData.certificate_number ||
                  !formData.certificate_name ||
                  !formData.issuing_authority ||
                  !formData.issue_date ||
                  !formData.expiry_date
                }
              >
                {isSubmitting ? 'Saving...' : 'Save Certificate'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddCertificateModal;
