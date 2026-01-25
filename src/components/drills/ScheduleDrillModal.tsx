import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDrills } from '@/hooks/useDrills';
import { useVessels } from '@/hooks/useVessels';
import { useCrew } from '@/hooks/useCrew';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { CalendarIcon, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WEATHER_CONDITIONS, DEFAULT_OBJECTIVES, DEFAULT_EQUIPMENT } from '@/lib/drillConstants';

interface ScheduleDrillModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ScheduleDrillModal: React.FC<ScheduleDrillModalProps> = ({ open, onOpenChange }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    drill_type_id: '',
    vessel_id: '',
    drill_date_scheduled: new Date(),
    conducted_by_id: '',
    location: '',
    expected_duration: 60,
    scenario_description: '',
    objectives: [] as string[],
    weather_conditions: '',
    participants: [] as { user_id: string; station_assignment: string }[],
    equipment: [] as { equipment_name: string; will_be_used: boolean }[],
  });
  const [newObjective, setNewObjective] = useState('');

  const { drillTypes, addDrill, addParticipants, addEquipment, isAddingDrill } = useDrills();
  const { vessels } = useVessels();
  const { crew } = useCrew();
  const { profile } = useAuth();

  // Get selected drill type info
  const selectedDrillType = drillTypes.find(dt => dt.id === formData.drill_type_id);

  // Load default objectives when drill type changes
  useEffect(() => {
    if (selectedDrillType) {
      const defaults = DEFAULT_OBJECTIVES[selectedDrillType.drill_name] || [];
      setFormData(prev => ({ ...prev, objectives: defaults }));

      const defaultEquip = DEFAULT_EQUIPMENT[selectedDrillType.drill_name] || [];
      setFormData(prev => ({ 
        ...prev, 
        equipment: defaultEquip.map(name => ({ equipment_name: name, will_be_used: true }))
      }));
    }
  }, [selectedDrillType]);

  // Load crew as participants when vessel changes
  useEffect(() => {
    if (formData.vessel_id) {
      // Use all crew members for now - they can be filtered by vessel assignment if needed
      setFormData(prev => ({
        ...prev,
        participants: crew.map(c => ({
          user_id: c.user_id,
          station_assignment: '',
        })),
      }));
    }
  }, [formData.vessel_id, crew]);

  const handleAddObjective = () => {
    if (newObjective.trim()) {
      setFormData(prev => ({
        ...prev,
        objectives: [...prev.objectives, newObjective.trim()],
      }));
      setNewObjective('');
    }
  };

  const handleRemoveObjective = (index: number) => {
    setFormData(prev => ({
      ...prev,
      objectives: prev.objectives.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = () => {
    addDrill({
      vessel_id: formData.vessel_id,
      drill_type_id: formData.drill_type_id,
      drill_date_scheduled: format(formData.drill_date_scheduled, 'yyyy-MM-dd'),
      drill_date_actual: null,
      drill_duration_minutes: null,
      scenario_description: formData.scenario_description,
      objectives: formData.objectives,
      conducted_by_id: formData.conducted_by_id || null,
      location: formData.location || null,
      weather_conditions: formData.weather_conditions || null,
      status: 'Scheduled',
      cancelled_reason: null,
      lessons_learned_positive: null,
      lessons_learned_improvement: null,
      recommendations: null,
      overall_rating: null,
    }, {
      onSuccess: (data) => {
        // Add participants
        if (formData.participants.length > 0 && data?.id) {
          addParticipants(formData.participants.map(p => ({
            drill_id: data.id,
            user_id: p.user_id,
            station_assignment: p.station_assignment || null,
            expected_to_attend: true,
            attended: null,
            absent_reason: null,
            late_arrival_minutes: null,
            performance_rating: null,
            comments: null,
          })));
        }

        // Add equipment
        if (formData.equipment.length > 0 && data?.id) {
          addEquipment(formData.equipment.filter(e => e.will_be_used).map(e => ({
            drill_id: data.id,
            equipment_name: e.equipment_name,
            equipment_used: null,
            equipment_status: null,
            notes: null,
          })));
        }

        onOpenChange(false);
        setStep(1);
        setFormData({
          drill_type_id: '',
          vessel_id: '',
          drill_date_scheduled: new Date(),
          conducted_by_id: '',
          location: '',
          expected_duration: 60,
          scenario_description: '',
          objectives: [],
          weather_conditions: '',
          participants: [],
          equipment: [],
        });
      },
    });
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.drill_type_id && formData.vessel_id && formData.drill_date_scheduled;
      case 2:
        return formData.scenario_description && formData.objectives.length > 0;
      case 3:
        return true; // Participants optional
      case 4:
        return true; // Equipment optional
      default:
        return false;
    }
  };

  const officers = crew.filter(c => 
    ['master', 'chief_officer', 'chief_engineer', 'dpa'].includes(c.role)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Drill - Step {step} of 4</DialogTitle>
        </DialogHeader>

        {/* Progress Indicator */}
        <div className="flex gap-2 mb-4">
          {[1, 2, 3, 4].map(s => (
            <div 
              key={s}
              className={cn(
                "flex-1 h-2 rounded-full",
                s <= step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step 1: Drill Type & Date */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Drill Type *</Label>
              <Select 
                value={formData.drill_type_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, drill_type_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select drill type" />
                </SelectTrigger>
                <SelectContent>
                  {drillTypes.map(type => (
                    <SelectItem key={type.id} value={type.id}>
                      <div className="flex items-center gap-2">
                        {type.drill_name}
                        {type.category === 'SOLAS_Required' && (
                          <Badge variant="secondary" className="text-xs">SOLAS</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDrillType && (
                <p className="text-xs text-muted-foreground">
                  Required every {selectedDrillType.minimum_frequency} days
                  {selectedDrillType.solas_reference && ` (${selectedDrillType.solas_reference})`}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Vessel *</Label>
              <Select 
                value={formData.vessel_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, vessel_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vessel" />
                </SelectTrigger>
                <SelectContent>
                  {vessels.map(vessel => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scheduled Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.drill_date_scheduled, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.drill_date_scheduled}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, drill_date_scheduled: date }))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Conducted By</Label>
              <Select 
                value={formData.conducted_by_id} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, conducted_by_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select officer (default: Master)" />
                </SelectTrigger>
                <SelectContent>
                  {officers.map(officer => (
                    <SelectItem key={officer.user_id} value={officer.user_id}>
                      {officer.first_name} {officer.last_name} ({officer.rank || officer.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g., Main Deck Aft"
                />
              </div>
              <div className="space-y-2">
                <Label>Expected Duration (minutes)</Label>
                <Input
                  type="number"
                  value={formData.expected_duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, expected_duration: parseInt(e.target.value) || 60 }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Scenario & Objectives */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Scenario Description *</Label>
              <Textarea
                value={formData.scenario_description}
                onChange={(e) => setFormData(prev => ({ ...prev, scenario_description: e.target.value }))}
                placeholder="Describe the emergency scenario for this drill..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Objectives *</Label>
              <div className="space-y-2">
                {formData.objectives.map((obj, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <span className="flex-1 text-sm">{obj}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => handleRemoveObjective(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value)}
                  placeholder="Add custom objective..."
                  onKeyPress={(e) => e.key === 'Enter' && handleAddObjective()}
                />
                <Button variant="outline" onClick={handleAddObjective}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Weather Conditions</Label>
              <Select 
                value={formData.weather_conditions} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, weather_conditions: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select conditions (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {WEATHER_CONDITIONS.map(condition => (
                    <SelectItem key={condition.value} value={condition.value}>
                      {condition.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 3: Participants */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Participants</Label>
              <p className="text-sm text-muted-foreground">
                All crew members from the selected vessel are listed below. Assign station duties as needed.
              </p>
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {formData.participants.map((participant, index) => {
                const crewMember = crew.find(c => c.user_id === participant.user_id);
                return (
                  <div key={participant.user_id} className="flex items-center gap-4 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">
                        {crewMember?.first_name} {crewMember?.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {crewMember?.rank || crewMember?.role}
                      </p>
                    </div>
                    <Input
                      className="w-48"
                      placeholder="Station assignment"
                      value={participant.station_assignment}
                      onChange={(e) => {
                        const updated = [...formData.participants];
                        updated[index].station_assignment = e.target.value;
                        setFormData(prev => ({ ...prev, participants: updated }));
                      }}
                    />
                  </div>
                );
              })}
              {formData.participants.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No crew members found. Select a vessel first.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Equipment */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Equipment Checklist</Label>
              <p className="text-sm text-muted-foreground">
                Select equipment that will be used in this drill.
              </p>
            </div>

            <div className="space-y-2">
              {formData.equipment.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-2 border rounded-lg">
                  <Checkbox
                    checked={item.will_be_used}
                    onCheckedChange={(checked) => {
                      const updated = [...formData.equipment];
                      updated[index].will_be_used = checked as boolean;
                      setFormData(prev => ({ ...prev, equipment: updated }));
                    }}
                  />
                  <span>{item.equipment_name}</span>
                </div>
              ))}
              {formData.equipment.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No default equipment for this drill type.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isAddingDrill || !canProceed()}>
              {isAddingDrill ? 'Scheduling...' : 'Schedule Drill'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleDrillModal;
