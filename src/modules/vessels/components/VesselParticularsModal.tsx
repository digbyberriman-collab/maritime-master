import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { VESSEL_PARTICULARS_SECTIONS } from '@/modules/vessels/config/particularsSchema';

interface VesselParticularsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vesselName: string;
  initialValues: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  isLoading?: boolean;
}

const VesselParticularsModal: React.FC<VesselParticularsModalProps> = ({
  open,
  onOpenChange,
  vesselName,
  initialValues,
  onSubmit,
  isLoading,
}) => {
  const [values, setValues] = useState<Record<string, string>>(initialValues || {});

  useEffect(() => {
    if (open) setValues(initialValues || {});
  }, [open, initialValues]);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    // Strip empty strings to keep payload tidy
    const cleaned: Record<string, string> = {};
    Object.entries(values).forEach(([k, v]) => {
      if (v && v.trim() !== '') cleaned[k] = v.trim();
    });
    await onSubmit(cleaned);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Vessel Particulars — {vesselName}</DialogTitle>
          <DialogDescription>
            Detailed vessel specification sheet. Free-text fields preserve units and notation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {VESSEL_PARTICULARS_SECTIONS.map((section) => (
            <div key={section.id} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">
                {section.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.fields.map((field) => (
                  <div
                    key={field.key}
                    className={field.multiline ? 'md:col-span-2 space-y-1.5' : 'space-y-1.5'}
                  >
                    <Label htmlFor={field.key}>{field.label}</Label>
                    {field.multiline ? (
                      <Textarea
                        id={field.key}
                        value={values[field.key] ?? ''}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={3}
                      />
                    ) : (
                      <Input
                        id={field.key}
                        value={values[field.key] ?? ''}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Particulars
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VesselParticularsModal;