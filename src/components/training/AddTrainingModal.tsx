import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTraining } from '@/hooks/useTraining';
import { useCrew } from '@/hooks/useCrew';
import { GRADE_OPTIONS, calculateTrainingStatus } from '@/lib/trainingConstants';
import { format, addMonths } from 'date-fns';
import { CalendarIcon, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddTrainingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddTrainingModal: React.FC<AddTrainingModalProps> = ({ open, onOpenChange }) => {
  const { courses, addTrainingRecord } = useTraining();
  const { crew } = useCrew();

  const [formData, setFormData] = useState({
    user_id: '',
    course_id: '',
    certificate_number: '',
    training_provider: '',
    completion_date: new Date(),
    issue_date: new Date(),
    expiry_date: null as Date | null,
    grade_result: '',
    notes: '',
  });

  const selectedCourse = courses.find(c => c.id === formData.course_id);

  // Auto-calculate expiry date based on course validity period
  const handleCourseChange = (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    let expiryDate: Date | null = null;
    
    if (course?.validity_period_months) {
      expiryDate = addMonths(formData.issue_date, course.validity_period_months);
    }

    setFormData({
      ...formData,
      course_id: courseId,
      expiry_date: expiryDate,
    });
  };

  const handleSubmit = async () => {
    if (!formData.user_id || !formData.course_id || !formData.training_provider) {
      return;
    }

    const status = calculateTrainingStatus(formData.expiry_date);

    await addTrainingRecord.mutateAsync({
      user_id: formData.user_id,
      course_id: formData.course_id,
      certificate_number: formData.certificate_number || null,
      training_provider: formData.training_provider,
      completion_date: format(formData.completion_date, 'yyyy-MM-dd'),
      issue_date: format(formData.issue_date, 'yyyy-MM-dd'),
      expiry_date: formData.expiry_date ? format(formData.expiry_date, 'yyyy-MM-dd') : null,
      grade_result: formData.grade_result || null,
      notes: formData.notes || null,
      status,
    });

    onOpenChange(false);
    setFormData({
      user_id: '',
      course_id: '',
      certificate_number: '',
      training_provider: '',
      completion_date: new Date(),
      issue_date: new Date(),
      expiry_date: null,
      grade_result: '',
      notes: '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Training Record</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Crew Member */}
          <div className="space-y-2">
            <Label>Crew Member *</Label>
            <Select value={formData.user_id} onValueChange={(v) => setFormData({ ...formData, user_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select crew member" />
              </SelectTrigger>
              <SelectContent>
                {crew.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.first_name} {c.last_name} - {c.rank || 'Crew'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Course */}
          <div className="space-y-2">
            <Label>Course/Certificate *</Label>
            <Select value={formData.course_id} onValueChange={handleCourseChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.course_code} - {c.course_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCourse && (
              <p className="text-xs text-muted-foreground">
                Category: {selectedCourse.course_category} 
                {selectedCourse.validity_period_months && ` • Valid for ${selectedCourse.validity_period_months} months`}
              </p>
            )}
          </div>

          {/* Certificate Number */}
          <div className="space-y-2">
            <Label>Certificate Number</Label>
            <Input
              value={formData.certificate_number}
              onChange={(e) => setFormData({ ...formData, certificate_number: e.target.value })}
              placeholder="e.g., STW-12345"
            />
          </div>

          {/* Training Provider */}
          <div className="space-y-2">
            <Label>Training Provider *</Label>
            <Input
              value={formData.training_provider}
              onChange={(e) => setFormData({ ...formData, training_provider: e.target.value })}
              placeholder="e.g., Maritime Training Center"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Completion Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.completion_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.completion_date ? format(formData.completion_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.completion_date}
                    onSelect={(date) => date && setFormData({ ...formData, completion_date: date })}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Issue Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.issue_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.issue_date ? format(formData.issue_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.issue_date}
                    onSelect={(date) => {
                      if (date) {
                        let expiryDate = formData.expiry_date;
                        if (selectedCourse?.validity_period_months) {
                          expiryDate = addMonths(date, selectedCourse.validity_period_months);
                        }
                        setFormData({ ...formData, issue_date: date, expiry_date: expiryDate });
                      }
                    }}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Expiry Date */}
          <div className="space-y-2">
            <Label>Expiry Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.expiry_date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.expiry_date ? format(formData.expiry_date, "PPP") : "No expiry (lifetime certificate)"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={formData.expiry_date || undefined}
                  onSelect={(date) => setFormData({ ...formData, expiry_date: date || null })}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Grade */}
          <div className="space-y-2">
            <Label>Grade/Result</Label>
            <Select value={formData.grade_result} onValueChange={(v) => setFormData({ ...formData, grade_result: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select grade (optional)" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_OPTIONS.map(g => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.user_id || !formData.course_id || !formData.training_provider || addTrainingRecord.isPending}
            >
              {addTrainingRecord.isPending ? 'Saving...' : 'Save Training Record'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddTrainingModal;
