import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useVessels } from "@/hooks/useVessels";
import { useCreateIncident, useUploadIncidentAttachment, PersonInvolved, Witness, IncidentFormData } from "@/hooks/useIncidents";
import { useCrew } from "@/hooks/useCrew";
import { INCIDENT_TYPES, VESSEL_LOCATIONS, SEVERITY_LEVELS } from "@/lib/incidentConstants";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  Plus,
  Trash2,
  Check,
  FileImage,
  FileText,
} from "lucide-react";

interface ReportIncidentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  "Incident Details",
  "People Involved",
  "Immediate Actions",
  "Severity Assessment",
  "Notifications",
  "Review & Submit",
];

export function ReportIncidentModal({ open, onOpenChange }: ReportIncidentModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<IncidentFormData>({
    vessel_id: "",
    incident_date: new Date().toISOString(),
    incident_type: "",
    location: "",
    description: "",
    immediate_action: "",
    persons_involved: [],
    witnesses: [],
    severity_actual: 1,
    severity_potential: 1,
    dpa_notified: false,
    attachments: [],
  });
  const [confirmed, setConfirmed] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);

  const { vessels } = useVessels();
  const { crew } = useCrew();
  const createIncident = useCreateIncident();
  const uploadAttachment = useUploadIncidentAttachment();

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    // Upload all pending files first
    const uploadedUrls: string[] = [];
    for (const file of uploadingFiles) {
      try {
        const url = await uploadAttachment.mutateAsync(file);
        uploadedUrls.push(url);
      } catch (error) {
        console.error("Failed to upload file:", error);
      }
    }

    await createIncident.mutateAsync({
      ...formData,
      attachments: [...formData.attachments, ...uploadedUrls],
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setCurrentStep(0);
    setFormData({
      vessel_id: "",
      incident_date: new Date().toISOString(),
      incident_type: "",
      location: "",
      description: "",
      immediate_action: "",
      persons_involved: [],
      witnesses: [],
      severity_actual: 1,
      severity_potential: 1,
      dpa_notified: false,
      attachments: [],
    });
    setConfirmed(false);
    setUploadingFiles([]);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setUploadingFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif"],
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const removeFile = (index: number) => {
    setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const addPerson = () => {
    setFormData((prev) => ({
      ...prev,
      persons_involved: [
        ...prev.persons_involved,
        { name: "", role: "", injured: false, injuryDetails: "" },
      ],
    }));
  };

  const updatePerson = (index: number, field: keyof PersonInvolved, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      persons_involved: prev.persons_involved.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      ),
    }));
  };

  const removePerson = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      persons_involved: prev.persons_involved.filter((_, i) => i !== index),
    }));
  };

  const addWitness = () => {
    setFormData((prev) => ({
      ...prev,
      witnesses: [...prev.witnesses, { name: "", statement: "" }],
    }));
  };

  const updateWitness = (index: number, field: keyof Witness, value: string) => {
    setFormData((prev) => ({
      ...prev,
      witnesses: prev.witnesses.map((w, i) =>
        i === index ? { ...w, [field]: value } : w
      ),
    }));
  };

  const removeWitness = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      witnesses: prev.witnesses.filter((_, i) => i !== index),
    }));
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 0:
        return (
          formData.vessel_id &&
          formData.incident_date &&
          formData.incident_type &&
          formData.location &&
          formData.description.length >= 50
        );
      case 1:
        return true; // Optional step
      case 2:
        return formData.immediate_action && formData.immediate_action.length > 0;
      case 3:
        return formData.severity_actual >= 1 && formData.severity_potential >= 1;
      case 4:
        return true;
      case 5:
        return confirmed;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vessel *</Label>
                <Select
                  value={formData.vessel_id}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, vessel_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vessel" />
                  </SelectTrigger>
                  <SelectContent>
                    {vessels?.map((vessel) => (
                      <SelectItem key={vessel.id} value={vessel.id}>
                        {vessel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Incident Date & Time *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.incident_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.incident_date
                        ? format(new Date(formData.incident_date), "PPP HH:mm")
                        : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={new Date(formData.incident_date)}
                      onSelect={(date) =>
                        date &&
                        setFormData((prev) => ({
                          ...prev,
                          incident_date: date.toISOString(),
                        }))
                      }
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Incident Type *</Label>
                <Select
                  value={formData.incident_type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, incident_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", type.color)} />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Location on Vessel *</Label>
                <Select
                  value={formData.location}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, location: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {VESSEL_LOCATIONS.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description * (minimum 50 characters)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Describe what happened in detail..."
                rows={5}
                className="resize-none"
              />
              <p className="text-sm text-muted-foreground">
                {formData.description.length}/50 characters (minimum)
              </p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Persons Involved</Label>
                <Button variant="outline" size="sm" onClick={addPerson}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Person
                </Button>
              </div>

              {formData.persons_involved.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No persons added yet. Click "Add Person" to add someone involved.
                </p>
              ) : (
                <div className="space-y-4">
                  {formData.persons_involved.map((person, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 space-y-3 relative"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => removePerson(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Select
                            value={person.name}
                            onValueChange={(value) =>
                              updatePerson(index, "name", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select or type name" />
                            </SelectTrigger>
                            <SelectContent>
                              {crew?.map((member) => (
                                <SelectItem
                                  key={member.id}
                                  value={`${member.first_name} ${member.last_name}`}
                                >
                                  {member.first_name} {member.last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Role at Time</Label>
                          <Input
                            value={person.role}
                            onChange={(e) =>
                              updatePerson(index, "role", e.target.value)
                            }
                            placeholder="e.g., Watch Officer"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`injured-${index}`}
                          checked={person.injured}
                          onCheckedChange={(checked) =>
                            updatePerson(index, "injured", checked === true)
                          }
                        />
                        <Label htmlFor={`injured-${index}`}>
                          Was this person injured?
                        </Label>
                      </div>

                      {person.injured && (
                        <div className="space-y-2">
                          <Label>Injury Details</Label>
                          <Textarea
                            value={person.injuryDetails}
                            onChange={(e) =>
                              updatePerson(index, "injuryDetails", e.target.value)
                            }
                            placeholder="Describe the injury..."
                            rows={2}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Witnesses</Label>
                <Button variant="outline" size="sm" onClick={addWitness}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Witness
                </Button>
              </div>

              {formData.witnesses.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No witnesses added yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {formData.witnesses.map((witness, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 space-y-3 relative"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => removeWitness(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>

                      <div className="space-y-2">
                        <Label>Witness Name</Label>
                        <Input
                          value={witness.name}
                          onChange={(e) =>
                            updateWitness(index, "name", e.target.value)
                          }
                          placeholder="Enter witness name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Statement</Label>
                        <Textarea
                          value={witness.statement}
                          onChange={(e) =>
                            updateWitness(index, "statement", e.target.value)
                          }
                          placeholder="Enter witness statement..."
                          rows={3}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>What immediate actions were taken? *</Label>
              <Textarea
                value={formData.immediate_action}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    immediate_action: e.target.value,
                  }))
                }
                placeholder="e.g., First aid administered, Area secured, Equipment shut down..."
                rows={5}
              />
              <p className="text-sm text-muted-foreground">
                Examples: First aid administered, Area secured, Equipment isolated,
                Spill contained
              </p>
            </div>

            <div className="space-y-4">
              <Label>Attachments (Photos, Documents)</Label>
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary"
                )}
              >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                {isDragActive ? (
                  <p>Drop the files here...</p>
                ) : (
                  <>
                    <p className="font-medium">Drag & drop files here</p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse (Images, PDF, Word - Max 10MB each)
                    </p>
                  </>
                )}
              </div>

              {uploadingFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadingFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {file.type.startsWith("image/") ? (
                          <FileImage className="h-5 w-5 text-info" />
                        ) : (
                          <FileText className="h-5 w-5 text-orange" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <Label className="text-base font-semibold">
                Actual Severity (What actually happened)
              </Label>
              <div className="space-y-2">
                {SEVERITY_LEVELS.map((level) => (
                  <div
                    key={level.value}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        severity_actual: level.value,
                      }))
                    }
                    className={cn(
                      "p-4 border rounded-lg cursor-pointer transition-all",
                      formData.severity_actual === level.value
                        ? "border-primary bg-primary/5"
                        : "hover:border-muted-foreground/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-white",
                            level.value <= 2
                              ? "bg-success"
                              : level.value === 3
                              ? "bg-warning"
                              : level.value === 4
                              ? "bg-orange"
                              : "bg-critical"
                          )}
                        >
                          {level.value}
                        </div>
                        <div>
                          <p className={cn("font-medium", level.color)}>
                            {level.label}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {level.description}
                          </p>
                        </div>
                      </div>
                      {formData.severity_actual === level.value && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-base font-semibold">
                Potential Severity (What could have happened)
              </Label>
              <p className="text-sm text-muted-foreground">
                If circumstances had been different, how severe could this have
                been?
              </p>
              <div className="space-y-2">
                {SEVERITY_LEVELS.map((level) => (
                  <div
                    key={level.value}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        severity_potential: level.value,
                      }))
                    }
                    className={cn(
                      "p-4 border rounded-lg cursor-pointer transition-all",
                      formData.severity_potential === level.value
                        ? "border-primary bg-primary/5"
                        : "hover:border-muted-foreground/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-white",
                            level.value <= 2
                              ? "bg-success"
                              : level.value === 3
                              ? "bg-warning"
                              : level.value === 4
                              ? "bg-orange"
                              : "bg-critical"
                          )}
                        >
                          {level.value}
                        </div>
                        <div>
                          <p className={cn("font-medium", level.color)}>
                            {level.label}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {level.description}
                          </p>
                        </div>
                      </div>
                      {formData.severity_potential === level.value && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {(formData.severity_actual >= 3 || formData.severity_potential >= 4) && (
              <div className="p-4 bg-warning-muted border border-warning/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
                  <div>
                    <p className="font-medium text-warning-foreground">
                      Investigation Required
                    </p>
                    <p className="text-sm text-warning-foreground/80">
                      Based on the severity assessment, this incident will require a
                      formal investigation.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Notify DPA (Designated Person Ashore)</p>
                  <p className="text-sm text-muted-foreground">
                    Required for severity 3 or higher
                  </p>
                </div>
                <Checkbox
                  checked={formData.dpa_notified || formData.severity_actual >= 3}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      dpa_notified: checked === true,
                    }))
                  }
                  disabled={formData.severity_actual >= 3}
                />
              </div>

              {formData.dpa_notified && (
                <div className="p-4 bg-info-muted border border-info/30 rounded-lg">
                  <p className="text-sm text-info-foreground">
                    The DPA will be notified via email once this incident is
                    submitted.
                  </p>
                </div>
              )}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold">Review Your Report</h3>

              <div className="grid gap-4">
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vessel:</span>
                    <span className="font-medium">
                      {vessels?.find((v) => v.id === formData.vessel_id)?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium">
                      {format(new Date(formData.incident_date), "PPP HH:mm")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <Badge
                      className={cn(
                        "text-white",
                        INCIDENT_TYPES.find((t) => t.value === formData.incident_type)
                          ?.color
                      )}
                    >
                      {formData.incident_type}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{formData.location}</span>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <p className="text-muted-foreground mb-2">Description:</p>
                  <p className="text-sm">{formData.description}</p>
                </div>

                <div className="p-4 border rounded-lg">
                  <p className="text-muted-foreground mb-2">Immediate Actions:</p>
                  <p className="text-sm">{formData.immediate_action}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-muted-foreground text-sm">Actual Severity</p>
                    <p className="text-3xl font-bold">{formData.severity_actual}</p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-muted-foreground text-sm">Potential Severity</p>
                    <p className="text-3xl font-bold">{formData.severity_potential}</p>
                  </div>
                </div>

                {formData.persons_involved.length > 0 && (
                  <div className="p-4 border rounded-lg">
                    <p className="text-muted-foreground mb-2">
                      Persons Involved: {formData.persons_involved.length}
                    </p>
                    <ul className="text-sm space-y-1">
                      {formData.persons_involved.map((p, i) => (
                        <li key={i}>
                          {p.name} ({p.role}){p.injured && " - Injured"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {uploadingFiles.length > 0 && (
                  <div className="p-4 border rounded-lg">
                    <p className="text-muted-foreground mb-2">
                      Attachments: {uploadingFiles.length} file(s)
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 p-4 border rounded-lg">
                <Checkbox
                  id="confirm"
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                />
                <Label htmlFor="confirm" className="cursor-pointer">
                  I confirm this information is accurate to the best of my knowledge
                </Label>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-critical" />
            Report Incident
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-between px-4 py-2 bg-muted/50 rounded-lg">
          {STEPS.map((step, index) => (
            <div
              key={step}
              className={cn(
                "flex items-center gap-2",
                index <= currentStep ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  index < currentStep
                    ? "bg-primary text-primary-foreground"
                    : index === currentStep
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {index < currentStep ? <Check className="h-3 w-3" /> : index + 1}
              </div>
              <span className="hidden md:inline text-sm">{step}</span>
            </div>
          ))}
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto py-4">{renderStep()}</div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
          >
            Cancel
          </Button>

          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}

            {currentStep < STEPS.length - 1 ? (
              <Button onClick={handleNext} disabled={!isStepValid()}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!confirmed || createIncident.isPending}
                className="bg-critical hover:bg-critical/90"
              >
                {createIncident.isPending ? "Submitting..." : "Submit Incident Report"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
