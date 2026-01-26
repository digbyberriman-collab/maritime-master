import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAudits } from '@/hooks/useAudits';
import { useVessels } from '@/hooks/useVessels';
import { useCrew } from '@/hooks/useCrew';
import { useAuth } from '@/contexts/AuthContext';
import { 
  AUDIT_TYPES, 
  AUDIT_SCOPES, 
  ISM_SECTIONS, 
  DEPARTMENTS,
  EXTERNAL_AUDITOR_ORGS 
} from '@/lib/auditConstants';

interface ScheduleAuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: 'Internal' | 'External';
}

const ScheduleAuditModal: React.FC<ScheduleAuditModalProps> = ({ 
  open, 
  onOpenChange,
  defaultType = 'Internal'
}) => {
  const { profile } = useAuth();
  const { addAudit, isAddingAudit } = useAudits();
  const { vessels } = useVessels();
  const { crew } = useCrew();

  const [auditType, setAuditType] = useState(defaultType === 'External' ? 'External_Annual' : 'Internal');
  const [auditScope, setAuditScope] = useState('Full SMS');
  const [vesselId, setVesselId] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [leadAuditorId, setLeadAuditorId] = useState<string>('');
  const [externalAuditorName, setExternalAuditorName] = useState('');
  const [externalAuditorOrg, setExternalAuditorOrg] = useState('');
  const [selectedSections, setSelectedSections] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [auditTeam, setAuditTeam] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const isExternal = auditType !== 'Internal';

  const handleSubmit = () => {
    if (!profile?.company_id || !scheduledDate) return;

    let sectionsToUse = selectedSections;
    if (auditScope === 'Full SMS') {
      sectionsToUse = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    }

    addAudit({
      audit_type: auditType,
      audit_scope: auditScope === 'Department-specific' ? `${auditScope} - ${selectedDepartment}` : auditScope,
      vessel_id: vesselId || null,
      company_id: profile.company_id,
      scheduled_date: format(scheduledDate, 'yyyy-MM-dd'),
      actual_start_date: null,
      actual_end_date: null,
      lead_auditor_id: isExternal ? null : (leadAuditorId || null),
      external_auditor_name: isExternal ? externalAuditorName : null,
      external_auditor_org: isExternal ? externalAuditorOrg : null,
      ism_sections_covered: sectionsToUse,
      status: 'Planned',
      audit_report_url: null,
      overall_result: null,
      notes: notes || null,
      audit_team: auditTeam,
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setAuditType(defaultType === 'External' ? 'External_Annual' : 'Internal');
    setAuditScope('Full SMS');
    setVesselId('');
    setScheduledDate(undefined);
    setLeadAuditorId('');
    setExternalAuditorName('');
    setExternalAuditorOrg('');
    setSelectedSections([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    setSelectedDepartment('');
    setAuditTeam([]);
    setNotes('');
  };

  const toggleSection = (section: number) => {
    setSelectedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule {isExternal ? 'External' : 'Internal'} Audit</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Audit Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Audit Type</Label>
              <Select value={auditType} onValueChange={setAuditType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {AUDIT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Vessel (optional for DOC audits)</Label>
              <Select value={vesselId || "__company__"} onValueChange={(v) => setVesselId(v === "__company__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Company-wide" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="__company__">Company-wide</SelectItem>
                  {vessels.map(vessel => (
                    <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Audit Scope */}
          <div className="space-y-2">
            <Label>Audit Scope</Label>
            <Select value={auditScope} onValueChange={setAuditScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {AUDIT_SCOPES.map(scope => (
                  <SelectItem key={scope.value} value={scope.value}>{scope.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ISM Sections (if specific sections selected) */}
          {auditScope === 'Specific sections' && (
            <div className="space-y-2">
              <Label>ISM Sections to Audit</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {ISM_SECTIONS.map(section => (
                  <div key={section.value} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`section-${section.value}`}
                      checked={selectedSections.includes(section.value)}
                      onCheckedChange={() => toggleSection(section.value)}
                    />
                    <label 
                      htmlFor={`section-${section.value}`} 
                      className="text-sm cursor-pointer"
                    >
                      {section.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Department (if department-specific) */}
          {auditScope === 'Department-specific' && (
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {DEPARTMENTS.map(dept => (
                    <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Scheduled Date */}
          <div className="space-y-2">
            <Label>Scheduled Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !scheduledDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {scheduledDate ? format(scheduledDate, 'PPP') : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={setScheduledDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Auditor Details */}
          {isExternal ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Auditing Organization</Label>
                <Select value={externalAuditorOrg} onValueChange={setExternalAuditorOrg}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {EXTERNAL_AUDITOR_ORGS.map(org => (
                      <SelectItem key={org} value={org}>{org}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Auditor Name (if known)</Label>
                <Input 
                  value={externalAuditorName}
                  onChange={(e) => setExternalAuditorName(e.target.value)}
                  placeholder="Auditor name"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lead Auditor</Label>
                <Select value={leadAuditorId} onValueChange={setLeadAuditorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select lead auditor" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {crew.map(member => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.first_name} {member.last_name} - {member.rank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Audit Team (optional)</Label>
                <Select 
                  value={auditTeam[0] || ''} 
                  onValueChange={(val) => val && setAuditTeam([...auditTeam, val])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Add team members" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {crew
                      .filter(m => m.user_id !== leadAuditorId && !auditTeam.includes(m.user_id))
                      .map(member => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.first_name} {member.last_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {auditTeam.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {auditTeam.map(id => {
                      const member = crew.find(m => m.user_id === id);
                      return member ? (
                        <span 
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm cursor-pointer hover:bg-muted/80"
                          onClick={() => setAuditTeam(auditTeam.filter(t => t !== id))}
                        >
                          {member.first_name} {member.last_name}
                          <span className="text-muted-foreground">×</span>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes or preparation requirements..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!scheduledDate || isAddingAudit}
          >
            {isAddingAudit ? 'Scheduling...' : 'Schedule Audit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleAuditModal;
