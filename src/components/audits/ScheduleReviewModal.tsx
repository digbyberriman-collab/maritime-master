import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAudits } from '@/hooks/useAudits';
import { useCrew } from '@/hooks/useCrew';
import { useAuth } from '@/contexts/AuthContext';
import { REVIEW_PERIODS, DEFAULT_AGENDA_ITEMS } from '@/lib/auditConstants';
import { Input } from '@/components/ui/input';

interface ScheduleReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ScheduleReviewModal: React.FC<ScheduleReviewModalProps> = ({ open, onOpenChange }) => {
  const { profile } = useAuth();
  const { addReview, isAddingReview } = useAudits();
  const { crew } = useCrew();

  const [reviewDate, setReviewDate] = useState<Date>();
  const [periodCovered, setPeriodCovered] = useState('');
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [agendaItems, setAgendaItems] = useState<string[]>([...DEFAULT_AGENDA_ITEMS]);
  const [customAgendaItem, setCustomAgendaItem] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState<Date>();

  const handleSubmit = () => {
    if (!profile?.company_id || !reviewDate || !periodCovered) return;

    const attendees = selectedAttendees.map(id => {
      const member = crew.find(m => m.user_id === id);
      return {
        user_id: id,
        name: member ? `${member.first_name} ${member.last_name}` : 'Unknown',
        role: member?.role || 'Unknown',
      };
    });

    addReview({
      review_date: format(reviewDate, 'yyyy-MM-dd'),
      company_id: profile.company_id,
      attendees: attendees,
      period_covered: periodCovered,
      agenda_items: agendaItems,
      incident_summary: {},
      audit_summary: {},
      capa_summary: {},
      sms_changes_needed: [],
      resource_decisions: [],
      action_items: [],
      minutes_url: null,
      status: 'Scheduled',
      next_review_date: nextReviewDate ? format(nextReviewDate, 'yyyy-MM-dd') : null,
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setReviewDate(undefined);
    setPeriodCovered('');
    setSelectedAttendees([]);
    setAgendaItems([...DEFAULT_AGENDA_ITEMS]);
    setCustomAgendaItem('');
    setNextReviewDate(undefined);
  };

  const toggleAttendee = (userId: string) => {
    setSelectedAttendees(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const addCustomAgendaItem = () => {
    if (customAgendaItem.trim()) {
      setAgendaItems([...agendaItems, customAgendaItem.trim()]);
      setCustomAgendaItem('');
    }
  };

  const removeAgendaItem = (index: number) => {
    setAgendaItems(agendaItems.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Management Review</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Review Date and Period */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Review Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !reviewDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reviewDate ? format(reviewDate, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={reviewDate}
                    onSelect={setReviewDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Period to Cover</Label>
              <Select value={periodCovered} onValueChange={setPeriodCovered}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {REVIEW_PERIODS.map(period => (
                    <SelectItem key={period.value} value={period.value}>{period.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Attendees */}
          <div className="space-y-2">
            <Label>Attendees</Label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
              {crew.map(member => (
                <div key={member.user_id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`attendee-${member.user_id}`}
                    checked={selectedAttendees.includes(member.user_id)}
                    onCheckedChange={() => toggleAttendee(member.user_id)}
                  />
                  <label
                    htmlFor={`attendee-${member.user_id}`}
                    className="text-sm cursor-pointer"
                  >
                    {member.first_name} {member.last_name}
                    <span className="text-muted-foreground ml-1">({member.role})</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Agenda Items */}
          <div className="space-y-2">
            <Label>Agenda Items</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
              {agendaItems.map((item, index) => (
                <div key={index} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm">{index + 1}. {item}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeAgendaItem(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customAgendaItem}
                onChange={(e) => setCustomAgendaItem(e.target.value)}
                placeholder="Add custom agenda item..."
                onKeyDown={(e) => e.key === 'Enter' && addCustomAgendaItem()}
              />
              <Button variant="outline" size="icon" onClick={addCustomAgendaItem}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Next Review Date */}
          <div className="space-y-2">
            <Label>Next Review Date (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !nextReviewDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {nextReviewDate ? format(nextReviewDate, 'PPP') : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={nextReviewDate}
                  onSelect={setNextReviewDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reviewDate || !periodCovered || isAddingReview}
          >
            {isAddingReview ? 'Scheduling...' : 'Schedule Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleReviewModal;
