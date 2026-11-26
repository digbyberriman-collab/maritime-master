import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RANKS, NATIONALITIES } from '@/modules/crew/constants';
import { 
  canEditField, 
  DEPARTMENTS, 
  GENDERS, 
  CREW_STATUSES,
  hasPermission,
  Permission,
} from '@/modules/auth/lib/permissions';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCan } from '@/lib/permissions/useCan';
import type { CrewMember, UpdateCrewMemberData } from '@/modules/crew/hooks/useCrew';
import {
  isMasterOffice,
  isPendingPlacementAssignment,
  MASTER_OFFICE_MESSAGE,
  OWN_POSITION_MESSAGE,
  PENDING_PLACEMENT_MESSAGE,
} from '@/modules/crew/lib/crewUpdateErrors';

// Extended form schema with all new fields
const formSchema = z.object({
  // Personal Information
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  preferredName: z.string().max(100).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  
  // Contact Information
  phone: z.string().optional(),
  emergencyContactName: z.string().max(255).optional(),
  emergencyContactPhone: z.string().max(50).optional(),
  
  // Employment Information
  rank: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(['Active', 'On Leave', 'Inactive', 'Pending', 'Invited']),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  rotation: z.string().max(100).optional(),
  cabin: z.string().max(50).optional(),
  
  // Assignment Information
  joinDate: z.string().optional(),
  position: z.string().optional(),
  
  // Documents & Compliance
  medicalExpiry: z.string().optional(),
  passportNumber: z.string().max(100).optional(),
  passportExpiry: z.string().optional(),
  visaStatus: z.string().max(100).optional(),
  
  // Notes
  notes: z.string().optional(),
}).refine((data) => {
  // Validate contract dates
  if (data.contractStartDate && data.contractEndDate) {
    return new Date(data.contractEndDate) > new Date(data.contractStartDate);
  }
  return true;
}, {
  message: 'Contract end date must be after start date',
  path: ['contractEndDate'],
});

type FormValues = z.infer<typeof formSchema>;

/** Profile fields: form field → the profiles column canEditField checks. */
type ProfileFormField = Exclude<keyof FormValues, 'joinDate' | 'position'>;
const PROFILE_FIELDS: ReadonlyArray<readonly [ProfileFormField, string]> = [
  ['firstName', 'first_name'],
  ['lastName', 'last_name'],
  ['preferredName', 'preferred_name'],
  ['dateOfBirth', 'date_of_birth'],
  ['gender', 'gender'],
  ['nationality', 'nationality'],
  ['phone', 'phone'],
  ['emergencyContactName', 'emergency_contact_name'],
  ['emergencyContactPhone', 'emergency_contact_phone'],
  ['rank', 'rank'],
  ['department', 'department'],
  ['status', 'status'],
  ['contractStartDate', 'contract_start_date'],
  ['contractEndDate', 'contract_end_date'],
  ['rotation', 'rotation'],
  ['cabin', 'cabin'],
  ['medicalExpiry', 'medical_expiry'],
  ['passportNumber', 'passport_number'],
  ['passportExpiry', 'passport_expiry'],
  ['visaStatus', 'visa_status'],
  ['notes', 'notes'],
];

/** A Select's "Not specified" reads as empty. */
const selectText = (value: string | undefined | null): string => (!value || value === '__none__' ? '' : value);

interface ExtendedCrewMember extends CrewMember {
  preferred_name?: string;
  date_of_birth?: string;
  gender?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  department?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  rotation?: string;
  cabin?: string;
  notes?: string;
  medical_expiry?: string;
  passport_number?: string;
  passport_expiry?: string;
  visa_status?: string;
}

interface FullCrewEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  crewMember: ExtendedCrewMember | null;
  /**
   * Saves the edit (updateCrewMember.mutateAsync). It reports its own
   * outcome (saved, partly saved, not saved); a rejection keeps the form
   * open with the edits.
   */
  onSubmit: (data: UpdateCrewMemberData) => Promise<unknown>;
  isLoading: boolean;
}

const FullCrewEditModal: React.FC<FullCrewEditModalProps> = ({
  isOpen,
  onClose,
  crewMember,
  onSubmit,
  isLoading,
}) => {
  const { profile, user } = useAuth();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  
  const userRole = profile?.role || null;
  const isOwnProfile = Boolean(crewMember?.user_id) && crewMember?.user_id === user?.id;

  // The crew-assignment and profile guards (Phase 2) decide position, rank
  // and joining date by users-access admin of the vessel. The form mirrors
  // them, so a locked field reads as locked before Save, not as a refusal
  // after it. useCan is false while loading (fail closed, D-04).
  const assignment = crewMember?.current_assignment ?? null;
  const isPlacement = isPendingPlacementAssignment(assignment);
  const pendingVesselId = crewMember?.is_imported
    ? crewMember.imported_vessel_id ?? (isPlacement ? assignment?.vessel_id ?? null : null)
    : null;
  const isPending = Boolean(pendingVesselId);
  const canAdminVessel = useCan('admin.access.users_access.admin', { vesselId: assignment?.vessel_id ?? null });
  const canAdminPendingVessel = useCan('admin.access.users_access.admin', { vesselId: pendingVesselId });
  const canAdminPending = isPending && canAdminPendingVessel;
  /** Who may make a row a Master: the pending vessel's admin for a placement, else the assignment vessel's. */
  const mayAppointMaster = isPlacement ? canAdminPending : canAdminVessel;

  /** Why Position is locked, or null when only the role rules apply. */
  const positionLock: string | null = isPlacement
    ? (canAdminPending ? null : PENDING_PLACEMENT_MESSAGE)
    : isOwnProfile && !canAdminVessel
      ? OWN_POSITION_MESSAGE
      : isMasterOffice(assignment?.position) && !canAdminVessel
        ? MASTER_OFFICE_MESSAGE
        : null;
  /**
   * Why Join Date is locked. A Master / Captain row's join date is the start
   * of the office (D-227), so moving it moves the Master: users-access admin
   * of the vessel only, as the crew-assignment guard enforces (D-237,
   * amending D-218). `current_assignment` carries no rank, so the position
   * decides here; the guard also checks the row's rank.
   */
  const joinDateLock: string | null = isPlacement
    ? (canAdminPending ? null : PENDING_PLACEMENT_MESSAGE)
    : isMasterOffice(assignment?.position) && !canAdminVessel
      ? MASTER_OFFICE_MESSAGE
      : null;
  const rankLock: string | null = isPending && !canAdminPending ? PENDING_PLACEMENT_MESSAGE : null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      preferredName: '',
      dateOfBirth: '',
      gender: '',
      nationality: '',
      phone: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      rank: '',
      department: '',
      status: 'Active',
      contractStartDate: '',
      contractEndDate: '',
      rotation: '',
      cabin: '',
      joinDate: '',
      position: '',
      medicalExpiry: '',
      passportNumber: '',
      passportExpiry: '',
      visaStatus: '',
      notes: '',
    },
  });

  // Watch for changes
  useEffect(() => {
    const subscription = form.watch(() => {
      setHasUnsavedChanges(true);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (isOpen && crewMember) {
      form.reset({
        firstName: crewMember.first_name || '',
        lastName: crewMember.last_name || '',
        preferredName: crewMember.preferred_name || '',
        dateOfBirth: crewMember.date_of_birth || '',
        gender: crewMember.gender || '',
        nationality: crewMember.nationality || '',
        phone: crewMember.phone || '',
        emergencyContactName: crewMember.emergency_contact_name || '',
        emergencyContactPhone: crewMember.emergency_contact_phone || '',
        rank: crewMember.rank || '',
        department: crewMember.department || '',
        status: (crewMember.status as FormValues['status']) || 'Active',
        contractStartDate: crewMember.contract_start_date || '',
        contractEndDate: crewMember.contract_end_date || '',
        rotation: crewMember.rotation || '',
        cabin: crewMember.cabin || '',
        joinDate: crewMember.current_assignment?.join_date || '',
        position: crewMember.current_assignment?.position || '',
        medicalExpiry: crewMember.medical_expiry || '',
        passportNumber: crewMember.passport_number || '',
        passportExpiry: crewMember.passport_expiry || '',
        visaStatus: crewMember.visa_status || '',
        notes: crewMember.notes || '',
      });
      setHasUnsavedChanges(false);
      setActiveTab('personal');
    }
  }, [isOpen, crewMember, form]);

  const handleSubmit = async (values: FormValues) => {
    if (!crewMember) return;

    const editable = (dbField: string) => canEditField(userRole, dbField, isOwnProfile);

    // Build update data based on editable fields
    const updateData: UpdateCrewMemberData = {
      userId: crewMember.user_id,
      profileId: crewMember.id,
    };

    // Only include fields the user can edit. A pending placement's rank is
    // sent only when it changed, by an admin of the pending vessel.
    for (const [formField, dbField] of PROFILE_FIELDS) {
      if (!editable(dbField)) continue;
      if (formField === 'rank' && isPending) {
        if (!rankLock && selectText(values.rank) !== selectText(crewMember.rank)) updateData.rank = values.rank;
        continue;
      }
      updateData[formField] = values[formField];
    }

    // Position and join date: only what changed from the loaded assignment.
    if (assignment) {
      const nextPosition = (values.position ?? '').trim();
      const nextJoinDate = values.joinDate ?? '';
      const positionChanged =
        !positionLock && editable('position') && nextPosition !== (assignment.position ?? '').trim();
      const joinDateChanged = !joinDateLock && editable('join_date') && nextJoinDate !== (assignment.join_date ?? '');

      if (positionChanged && isMasterOffice(nextPosition) && !mayAppointMaster) {
        form.setError('position', { type: 'manual', message: MASTER_OFFICE_MESSAGE });
        setActiveTab('employment');
        return;
      }

      if (isPlacement) {
        // Not a crew_assignments row: the placement's position and joining
        // date live on the profile until the person signs in.
        if (positionChanged) updateData.pendingPosition = nextPosition;
        if (joinDateChanged) updateData.pendingJoiningDate = nextJoinDate;
      } else if (positionChanged || joinDateChanged) {
        if (positionChanged && !nextPosition) {
          form.setError('position', { type: 'manual', message: 'Enter a position.' });
          setActiveTab('employment');
          return;
        }
        if (joinDateChanged && !nextJoinDate) {
          form.setError('joinDate', { type: 'manual', message: 'Enter a join date.' });
          setActiveTab('employment');
          return;
        }
        updateData.assignmentId = assignment.id;
        if (positionChanged) updateData.position = nextPosition;
        if (joinDateChanged) updateData.joinDate = nextJoinDate;
      }
    }

    try {
      await onSubmit(updateData);
    } catch {
      // onSubmit reported the outcome (not saved, or partly saved). Keep
      // the form open with the edits.
      return;
    }
    setHasUnsavedChanges(false);
    onClose();
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    onClose();
  };

  const isFieldDisabled = (fieldName: string): boolean => {
    return !canEditField(userRole, fieldName, isOwnProfile);
  };

  // Check if user has any edit permissions
  const canEdit = hasPermission(userRole, Permission.EDIT_CREW_FULL, {
    targetUserId: crewMember?.user_id,
    currentUserId: user?.id,
  }) || hasPermission(userRole, Permission.EDIT_CREW_BASIC) || 
    hasPermission(userRole, Permission.EDIT_OWN_PROFILE, {
      targetUserId: crewMember?.user_id,
      currentUserId: user?.id,
    });

  if (!crewMember) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Crew Profile</DialogTitle>
          <DialogDescription>
            Update {crewMember.first_name} {crewMember.last_name}'s profile information.
          </DialogDescription>
        </DialogHeader>

        {hasUnsavedChanges && (
          <Alert variant="default" className="bg-warning/10 border-warning">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              You have unsaved changes
            </AlertDescription>
          </Alert>
        )}

        {!canEdit && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You don't have permission to edit this profile
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
                <TabsTrigger value="employment">Employment</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>

              {/* Personal Information Tab */}
              <TabsContent value="personal" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            disabled={isFieldDisabled('first_name')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            disabled={isFieldDisabled('last_name')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="preferredName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Nickname or preferred name" 
                          {...field} 
                          disabled={isFieldDisabled('preferred_name')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            disabled={isFieldDisabled('date_of_birth')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || "__none__"}
                          disabled={isFieldDisabled('gender')}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-popover">
                            <SelectItem value="__none__">Not specified</SelectItem>
                            {GENDERS.map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nationality</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || "__none__"}
                        disabled={isFieldDisabled('nationality')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select nationality" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover max-h-60">
                          <SelectItem value="__none__">Not specified</SelectItem>
                          {NATIONALITIES.map((nat) => (
                            <SelectItem key={nat} value={nat}>{nat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email shown as read-only */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input value={crewMember.email} disabled className="bg-muted" />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
              </TabsContent>

              {/* Contact Information Tab */}
              <TabsContent value="contact" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="+1 234 567 8900" 
                          {...field} 
                          disabled={isFieldDisabled('phone')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-medium mb-3">Emergency Contact</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emergencyContactName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Emergency contact name" 
                              {...field} 
                              disabled={isFieldDisabled('emergency_contact_name')}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emergencyContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Phone</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="+1 234 567 8900" 
                              {...field} 
                              disabled={isFieldDisabled('emergency_contact_phone')}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Employment Tab */}
              <TabsContent value="employment" className="space-y-4 mt-4">
                {/* Current Assignment Section */}
                {crewMember?.current_assignment && (
                  <div className="border rounded-lg p-4 bg-muted/30 mb-4">
                    <h3 className="text-sm font-medium mb-3">Current Vessel Assignment</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground">Vessel</label>
                        <p className="text-sm font-medium">{crewMember.current_assignment.vessel_name}</p>
                      </div>
                      <FormField
                        control={form.control}
                        name="position"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Position</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., Chief Engineer" 
                                {...field} 
                                disabled={isFieldDisabled('position') || positionLock !== null}
                              />
                            </FormControl>
                            {positionLock && (
                              <FormDescription className="text-xs">{positionLock}</FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="joinDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Join Date</FormLabel>
                            <FormControl>
                              <Input 
                                type="date" 
                                {...field} 
                                disabled={isFieldDisabled('join_date') || joinDateLock !== null}
                              />
                            </FormControl>
                            {joinDateLock && (
                              <FormDescription className="text-xs">{joinDateLock}</FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="rank"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rank</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || "__none__"}
                          disabled={isFieldDisabled('rank') || rankLock !== null}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select rank" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-popover max-h-60">
                            <SelectItem value="__none__">Not specified</SelectItem>
                            {RANKS.map((rank) => (
                              <SelectItem key={rank} value={rank}>{rank}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {rankLock && <FormDescription className="text-xs">{rankLock}</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value || "__none__"}
                          disabled={isFieldDisabled('department')}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-popover">
                            <SelectItem value="__none__">Not specified</SelectItem>
                            {DEPARTMENTS.map((dept) => (
                              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        disabled={isFieldDisabled('status')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-popover">
                          {CREW_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contractStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract Start Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            disabled={isFieldDisabled('contract_start_date')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contractEndDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract End Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            disabled={isFieldDisabled('contract_end_date')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="rotation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rotation</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., 2 months on / 2 months off" 
                            {...field} 
                            disabled={isFieldDisabled('rotation')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cabin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cabin</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., A-12" 
                            {...field} 
                            disabled={isFieldDisabled('cabin')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Documents & Compliance Tab */}
              <TabsContent value="documents" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="medicalExpiry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medical Certificate Expiry</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          disabled={isFieldDisabled('medical_expiry')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="passportNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Passport Number</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            disabled={isFieldDisabled('passport_number')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="passportExpiry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Passport Expiry</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            disabled={isFieldDisabled('passport_expiry')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="visaStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Visa Status</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Valid B1/B2" 
                          {...field} 
                          disabled={isFieldDisabled('visa_status')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Additional notes about this crew member..."
                          rows={4}
                          {...field} 
                          disabled={isFieldDisabled('notes')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !canEdit}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FullCrewEditModal;
