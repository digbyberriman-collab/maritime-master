import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';
import { toast } from '@/shared/hooks/use-toast';
import { notify } from '@/shared/lib/notify';
import {
  ASSIGNMENT_NOT_CHANGED_MESSAGE,
  CrewUpdatePartialError,
  crewRefusalMessage,
  PENDING_PLACEMENT_ID_PREFIX,
} from '@/modules/crew/lib/crewUpdateErrors';
// Types only: useCrew lands in the entry chunk, so the create-crew-member
// wrapper (adminActions) is loaded when someone adds crew (gap/00 I6 budget).
import type {
  CreateCrewMemberInput,
  CreateCrewOutcome,
  EdgeFailure,
} from '@/modules/auth/services/adminActions';

export interface CrewMember {
  id: string;
  // Imported crew live in the roster without a login account yet, so
  // user_id can be null until they're invited and verify their email.
  user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  rank: string | null;
  nationality: string | null;
  phone: string | null;
  status: string | null;
  role: string;
  created_at: string;
  // Extended profile fields
  preferred_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  department?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  rotation?: string | null;
  cabin?: string | null;
  notes?: string | null;
  medical_expiry?: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  visa_status?: string | null;
  // Personnel classification — one database for crew, contractors and shoreside staff
  personnel_type?: string | null;
  place_of_birth?: string | null;
  passport_country?: string | null;
  seamans_book_number?: string | null;
  embarkation_port?: string | null;
  office_location?: string | null;
  job_title?: string | null;
  // Account status fields
  account_status?: string | null;
  last_login_at?: string | null;
  invited_at?: string | null;
  // Imported via CSV / bulk import — has profile but no auth account yet.
  is_imported?: boolean;
  /** The pending vessel placement of an imported profile (profiles.imported_vessel_id). */
  imported_vessel_id?: string | null;
  // Assignment
  current_assignment?: {
    id: string;
    vessel_id: string;
    vessel_name: string;
    position: string;
    join_date: string;
    /** crew_assignments.rank (D-237); for a pending placement, the profile's rank. */
    rank?: string | null;
    /** crew_assignments.leave_date / end_date: a row whose date has passed is stale (D-227), not current. */
    leave_date?: string | null;
    end_date?: string | null;
    /**
     * True when this is an imported profile's pending placement, built from
     * profiles.imported_vessel_id / position / rank / joining_date: not a
     * crew_assignments row (isPendingPlacementAssignment).
     */
    pending_placement?: boolean;
  } | null;
}

export interface CrewAssignment {
  id: string;
  vessel_id: string;
  user_id: string;
  position: string;
  join_date: string;
  leave_date: string | null;
  is_current: boolean;
  vessel?: {
    id: string;
    name: string;
  };
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

/**
 * A new crew member (create-crew-member). There is no password (the person
 * sets one from the invitation link) and no company (the function uses the
 * caller's).
 * Crew roles only; admin roles are given in Users & Access (D-124).
 */
export type AddCrewMemberData = CreateCrewMemberInput;

/** create-crew-member refused or failed: nothing was added. The form shows `message` and stays open. */
export class CrewCreateFailedError extends Error {
  readonly failure: EdgeFailure;
  constructor(failure: EdgeFailure) {
    super(failure.message);
    this.name = 'CrewCreateFailedError';
    this.failure = failure;
  }
}

export interface UpdateCrewMemberData {
  /** profiles.user_id. Null for imported crew who have not been invited yet. */
  userId: string | null;
  /** profiles.id. Preferred write key: it exists for every profile, including imported crew. */
  profileId?: string;
  // Personal Information
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  // Contact Information
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  // Employment Information
  rank?: string;
  department?: string;
  status?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  rotation?: string;
  cabin?: string;
  // Documents & Compliance
  medicalExpiry?: string;
  passportNumber?: string;
  passportExpiry?: string;
  visaStatus?: string;
  // Notes
  notes?: string;
  // Assignment fields: the current crew_assignments row. Send them only
  // when they changed; never for a pending placement.
  assignmentId?: string;
  joinDate?: string;
  position?: string;
  // Pending placement (an imported profile's imported_vessel_id, which is
  // not a crew_assignments row): profiles.position and profiles.joining_date,
  // which become the assignment when the person signs in.
  pendingPosition?: string;
  pendingJoiningDate?: string;
}

export interface TransferCrewData {
  userId: string;
  currentAssignmentId: string;
  newVesselId: string;
  position: string;
  transferDate: string;
  notes?: string;
}

export interface SignOffCrewData {
  assignmentId: string;
  leaveDate: string;
  /** Why the assignment ended (contract_end, transfer, resignation, …). Stored in crew_assignments.end_reason. */
  reason?: string;
  notes?: string;
}

/** Columns snapshotted into audit_logs when an assignment changes. */
const ASSIGNMENT_AUDIT_COLUMNS = 'id, user_id, vessel_id, position, rank, department, join_date, leave_date, is_current, end_reason, notes';

type AssignmentAuditSnapshot = Record<string, unknown> | null;

/** A pending placement is a profile's vessel, not a crew_assignments row (D-225). */
export const PENDING_PLACEMENT_NOT_ASSIGNED_MESSAGE =
  'This person is not assigned to the vessel yet: they are assigned once they are invited and their login is linked.';
/** A profile update that matched no row. */
export const CREW_NOT_CHANGED_MESSAGE = "You can't change this crew member.";
const TRANSFER_PARTIAL_PREFIX = 'The old assignment was ended, but the new one was not saved:';
const DEACTIVATE_PARTIAL_PREFIX = 'The profile was marked inactive, but not every assignment was ended:';

/** Today as a local calendar day (yyyy-MM-dd), never the UTC day. */
const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isPendingPlacementId = (assignmentId: string | null | undefined) =>
  typeof assignmentId === 'string' && assignmentId.startsWith(PENDING_PLACEMENT_ID_PREFIX);

/**
 * A two-step crew write that saved its first step only (the old assignment
 * ended, the new one refused; the profile inactive, an assignment left
 * open). Reported as "Partly saved" with the reason, never as success.
 */
export class CrewTransferPartialError extends Error {
  readonly reason: string;
  constructor(reason: string, prefix: string = TRANSFER_PARTIAL_PREFIX) {
    super(`${prefix} ${reason}`);
    this.name = 'CrewTransferPartialError';
    this.reason = reason;
  }
}

/** The profile columns a CrewMember is built from (never select('*'): gap/04 implementation notes). */
export const CREW_MEMBER_PROFILE_COLUMNS =
  'id, user_id, email, first_name, last_name, rank, position, nationality, phone, status, role, created_at, preferred_name, date_of_birth, gender, emergency_contact_name, emergency_contact_phone, department, contract_start_date, contract_end_date, rotation, cabin, notes, medical_expiry, passport_number, passport_expiry, visa_status, personnel_type, place_of_birth, passport_country, seamans_book_number, embarkation_port, office_location, job_title, account_status, last_login_at, invited_at, is_imported, imported_vessel_id, joining_date' as const;

/** The crew_assignments columns of a current assignment, with its vessel. */
export const CREW_MEMBER_ASSIGNMENT_COLUMNS = 'id, vessel_id, user_id, position, rank, join_date, leave_date, end_date, vessels:vessel_id (id, name)' as const;

type CrewMemberProfileRow = Pick<
  Tables<'profiles'>,
  | 'id' | 'user_id' | 'email' | 'first_name' | 'last_name' | 'rank' | 'position' | 'nationality' | 'phone' | 'status' | 'role'
  | 'created_at' | 'preferred_name' | 'date_of_birth' | 'gender' | 'emergency_contact_name' | 'emergency_contact_phone'
  | 'department' | 'contract_start_date' | 'contract_end_date' | 'rotation' | 'cabin' | 'notes' | 'medical_expiry'
  | 'passport_number' | 'passport_expiry' | 'visa_status' | 'personnel_type' | 'place_of_birth' | 'passport_country'
  | 'seamans_book_number' | 'embarkation_port' | 'office_location' | 'job_title' | 'account_status' | 'last_login_at'
  | 'invited_at' | 'is_imported' | 'imported_vessel_id' | 'joining_date'
>;

interface CrewMemberAssignmentRow {
  id: string;
  vessel_id: string;
  position: string;
  rank: string | null;
  join_date: string;
  leave_date: string | null;
  end_date: string | null;
  /** The embedded vessel (one row; tolerated as a one-element list). */
  vessels: { id: string; name: string } | { id: string; name: string }[] | null;
}

const vesselNameOf = (vessels: CrewMemberAssignmentRow['vessels']): string | null => {
  const vessel = Array.isArray(vessels) ? vessels[0] : vessels;
  return vessel?.name ?? null;
};

/**
 * One CrewMember from its profile and current assignment. An imported
 * profile without an assignment gets its pending vessel placement
 * (profiles.imported_vessel_id), shaped as an assignment so the existing
 * UI keeps working but never written as one (isPendingPlacementAssignment,
 * D-225).
 */
export function toCrewMember(
  p: CrewMemberProfileRow,
  assignment: CrewMemberAssignmentRow | null,
  importedVessel: { id: string; name: string } | null,
): CrewMember {
  return {
    id: p.id,
    user_id: p.user_id,
    email: p.email,
    first_name: p.first_name,
    last_name: p.last_name,
    rank: p.rank,
    nationality: p.nationality,
    phone: p.phone,
    status: p.status,
    role: p.role,
    created_at: p.created_at,
    preferred_name: p.preferred_name,
    date_of_birth: p.date_of_birth,
    gender: p.gender,
    emergency_contact_name: p.emergency_contact_name,
    emergency_contact_phone: p.emergency_contact_phone,
    department: p.department,
    contract_start_date: p.contract_start_date,
    contract_end_date: p.contract_end_date,
    rotation: p.rotation,
    cabin: p.cabin,
    notes: p.notes,
    medical_expiry: p.medical_expiry,
    passport_number: p.passport_number,
    passport_expiry: p.passport_expiry,
    visa_status: p.visa_status,
    personnel_type: p.personnel_type ?? 'crew',
    place_of_birth: p.place_of_birth,
    passport_country: p.passport_country,
    seamans_book_number: p.seamans_book_number,
    embarkation_port: p.embarkation_port,
    office_location: p.office_location,
    job_title: p.job_title,
    account_status: p.account_status,
    last_login_at: p.last_login_at,
    invited_at: p.invited_at,
    is_imported: p.is_imported ?? false,
    imported_vessel_id: p.imported_vessel_id ?? null,
    current_assignment: assignment
      ? {
          id: assignment.id,
          vessel_id: assignment.vessel_id,
          vessel_name: vesselNameOf(assignment.vessels) || 'Unknown',
          position: assignment.position,
          join_date: assignment.join_date,
          rank: assignment.rank ?? null,
          leave_date: assignment.leave_date ?? null,
          end_date: assignment.end_date ?? null,
        }
      : importedVessel
        ? {
            // What fulfil_imported_assignment() will write: the
            // profile's position, else its rank, else Crew.
            id: `${PENDING_PLACEMENT_ID_PREFIX}${p.id}`,
            vessel_id: importedVessel.id,
            vessel_name: importedVessel.name,
            position: p.position?.trim() || p.rank?.trim() || 'Crew',
            join_date: p.joining_date ?? p.created_at,
            rank: p.rank ?? null,
            leave_date: null,
            end_date: null,
            pending_placement: true,
          }
        : null,
  };
}

// Fetch all crew members for the company
/**
 * Every crew member of the company (or of one vessel), and the legacy crew
 * writers. `options.enabled: false` keeps the list query off while a page
 * uses only the writers (the vessel crew list reads crew_vessel_list and
 * falls back to this list only when that RPC is not live, D-01).
 */
export const useCrew = (vesselFilter?: string, options: { enabled?: boolean } = {}) => {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  /** Best-effort snapshot of an assignment row for audit old_values. */
  const snapshotAssignment = async (assignmentId: string): Promise<AssignmentAuditSnapshot> => {
    const { data } = await supabase
      .from('crew_assignments')
      .select(ASSIGNMENT_AUDIT_COLUMNS)
      .eq('id', assignmentId)
      .maybeSingle();
    return (data as AssignmentAuditSnapshot) ?? null;
  };

  /** Writes an audit_logs row for a crew_assignment change; never throws. */
  const logAssignmentAudit = async (
    assignmentId: string,
    action: 'CREATE' | 'UPDATE',
    oldValues: AssignmentAuditSnapshot,
    newValues: Record<string, unknown>,
  ) => {
    try {
      const changedFields = Object.fromEntries(
        Object.keys(newValues).filter((k) => (oldValues ? oldValues[k] !== newValues[k] : true)).map((k) => [k, true]),
      );
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: 'crew_assignment',
        entity_id: assignmentId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: profile?.email ?? null,
        actor_role: profile?.role ?? null,
        changed_fields: changedFields as Json,
        old_values: (oldValues ?? {}) as Json,
        new_values: newValues as Json,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (error) console.error('Failed to log assignment audit:', error);
    } catch (error) {
      console.error('Failed to log assignment audit:', error);
    }
  };

  const queryEnabled = (options.enabled ?? true) && !!profile?.company_id;
  const crewQuery = useQuery({
    queryKey: ['crew', profile?.company_id, vesselFilter],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      // Every profile of the company, with the columns CrewMember needs.
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(CREW_MEMBER_PROFILE_COLUMNS)
        .eq('company_id', profile.company_id);

      if (profilesError) throw profilesError;
      if (!profiles || profiles.length === 0) return [];

      // Get current assignments with vessel details
      const { data: assignments, error: assignmentsError } = await supabase
        .from('crew_assignments')
        .select(CREW_MEMBER_ASSIGNMENT_COLUMNS)
        .eq('is_current', true);

      if (assignmentsError) throw assignmentsError;

      // For imported crew (no auth user yet, no crew_assignment), look up
      // their assigned vessel via the profiles.imported_vessel_id link.
      const importedVesselIds = Array.from(
        new Set(
          profiles
            .filter((p) => p.is_imported && p.imported_vessel_id)
            .map((p) => p.imported_vessel_id as string),
        ),
      );
      let importedVesselMap: Record<string, { id: string; name: string }> = {};
      if (importedVesselIds.length > 0) {
        const { data: vesselsData } = await supabase
          .from('vessels')
          .select('id, name')
          .in('id', importedVesselIds);
        importedVesselMap = Object.fromEntries(
          (vesselsData ?? []).map((v) => [v.id, v]),
        );
      }

      const crewMembers: CrewMember[] = profiles.map((p) => {
        const assignment = assignments?.find((a) => a.user_id === p.user_id) ?? null;
        const importedVessel =
          !assignment && p.is_imported && p.imported_vessel_id ? importedVesselMap[p.imported_vessel_id] ?? null : null;
        return toCrewMember(p, assignment, importedVessel);
      });

      // Filter by vessel if specified
      if (vesselFilter && vesselFilter !== 'all') {
        return crewMembers.filter(
          (c) => c.current_assignment?.vessel_id === vesselFilter
        );
      }

      return crewMembers;
    },
    enabled: queryEnabled,
  });

  /**
   * Add a crew member through create-crew-member (the typed wrapper). The
   * toast says what the function answered (D-143): "added" only after its
   * 201, the invitation as it went, a partial failure as such. A refusal
   * (nothing added) rejects with `CrewCreateFailedError` so the form can show
   * it and stay open.
   */
  const addCrewMember = useMutation({
    mutationFn: async (data: AddCrewMemberData): Promise<CreateCrewOutcome> => {
      const [{ createCrewMember, createCrewNotice }, { showOutcomeNotice }] = await Promise.all([
        import('@/modules/auth/services/adminActions'),
        import('@/modules/auth/lib/outcomeNotices'),
      ]);
      const outcome = await createCrewMember(data);
      if (outcome.kind === 'failed') throw new CrewCreateFailedError(outcome.failure);
      showOutcomeNotice(createCrewNotice(outcome, `${data.firstName} ${data.lastName}`.trim()));
      return outcome;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-count'] });
      queryClient.invalidateQueries({ queryKey: ['users-access'] });
    },
  });

  const updateCrewMember = useMutation({
    mutationFn: async (data: UpdateCrewMemberData) => {
      const updateData: Record<string, any> = {};
      
      // Personal Information
      if (data.firstName) updateData.first_name = data.firstName;
      if (data.lastName) updateData.last_name = data.lastName;
      if (data.preferredName !== undefined) updateData.preferred_name = data.preferredName || null;
      if (data.dateOfBirth !== undefined) updateData.date_of_birth = data.dateOfBirth || null;
      if (data.gender !== undefined) updateData.gender = data.gender === '__none__' ? null : data.gender || null;
      if (data.nationality !== undefined) updateData.nationality = data.nationality === '__none__' ? null : data.nationality || null;
      
      // Contact Information
      if (data.phone !== undefined) updateData.phone = data.phone || null;
      if (data.emergencyContactName !== undefined) updateData.emergency_contact_name = data.emergencyContactName || null;
      if (data.emergencyContactPhone !== undefined) updateData.emergency_contact_phone = data.emergencyContactPhone || null;
      
      // Employment Information
      if (data.rank !== undefined) updateData.rank = data.rank === '__none__' ? null : data.rank || null;
      if (data.department !== undefined) updateData.department = data.department === '__none__' ? null : data.department || null;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.contractStartDate !== undefined) updateData.contract_start_date = data.contractStartDate || null;
      if (data.contractEndDate !== undefined) updateData.contract_end_date = data.contractEndDate || null;
      if (data.rotation !== undefined) updateData.rotation = data.rotation || null;
      if (data.cabin !== undefined) updateData.cabin = data.cabin || null;
      
      // Documents & Compliance
      if (data.medicalExpiry !== undefined) updateData.medical_expiry = data.medicalExpiry || null;
      if (data.passportNumber !== undefined) updateData.passport_number = data.passportNumber || null;
      if (data.passportExpiry !== undefined) updateData.passport_expiry = data.passportExpiry || null;
      if (data.visaStatus !== undefined) updateData.visa_status = data.visaStatus || null;
      
      // Notes
      if (data.notes !== undefined) updateData.notes = data.notes || null;

      // Pending placement (imported profile): its position and joining date
      // live on the profile until the person signs in.
      if (data.pendingPosition !== undefined) updateData.position = data.pendingPosition.trim() || null;
      if (data.pendingJoiningDate !== undefined) updateData.joining_date = data.pendingJoiningDate || null;
      
      // Metadata
      updateData.updated_at = new Date().toISOString();

      // Update profile. Key on profiles.id when we have it: imported crew have
      // no user_id yet, and `.eq('user_id', null)` silently matches nothing.
      if (!data.profileId && !data.userId) {
        throw new Error('Cannot update a crew member without a profile id');
      }
      const profileQuery = supabase.from('profiles').update(updateData);
      const { data: updatedRows, error } = await (data.profileId
        ? profileQuery.eq('id', data.profileId)
        : profileQuery.eq('user_id', data.userId as string)
      ).select('id');

      // A guard refusal reads as its DETAIL sentence, never the raw code.
      if (error) throw new Error(crewRefusalMessage(error));
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('No changes were saved. You may not have permission to edit this crew member.');
      }

      // Update the current assignment when its join date or position
      // changed. The profile is saved by now, so a refusal here is a
      // partial save and is reported as one (non-negotiable 9).
      if (
        data.assignmentId &&
        !data.assignmentId.startsWith(PENDING_PLACEMENT_ID_PREFIX) &&
        (data.joinDate !== undefined || data.position !== undefined)
      ) {
        const assignmentUpdate: TablesUpdate<'crew_assignments'> = { updated_at: new Date().toISOString() };
        if (data.joinDate !== undefined) assignmentUpdate.join_date = data.joinDate;
        if (data.position !== undefined) assignmentUpdate.position = data.position;

        const { data: assignmentRows, error: assignmentError } = await supabase
          .from('crew_assignments')
          .update(assignmentUpdate)
          .eq('id', data.assignmentId)
          .select('id');

        if (assignmentError) {
          queryClient.invalidateQueries({ queryKey: ['crew'] });
          throw new CrewUpdatePartialError(crewRefusalMessage(assignmentError));
        }
        if (!assignmentRows || assignmentRows.length === 0) {
          queryClient.invalidateQueries({ queryKey: ['crew'] });
          throw new CrewUpdatePartialError(ASSIGNMENT_NOT_CHANGED_MESSAGE);
        }
      }
    },
    // Reached only when the profile and the assignment change both saved.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      toast({
        title: 'Success',
        description: 'Crew member updated successfully',
      });
    },
    onError: (error: Error) => {
      if (error instanceof CrewUpdatePartialError) {
        // The profile did change.
        queryClient.invalidateQueries({ queryKey: ['crew'] });
        notify.warning('Partly saved', { description: error.message });
        return;
      }
      toast({
        title: 'Not saved',
        description: crewRefusalMessage(error),
        variant: 'destructive',
      });
    },
  });

  /**
   * The legacy two-step transfer: end the current assignment, then open one
   * on the new vessel (X1-11 replaces it with one definer, D-207). A pending
   * placement is not an assignment and is refused (D-225). Each write must
   * report the row it changed; zero rows is a refusal ("You can't change
   * this assignment."). When the old assignment was ended but the new one
   * was not saved, the outcome is a partial save, never a success.
   */
  const transferCrew = useMutation({
    mutationFn: async (data: TransferCrewData) => {
      if (isPendingPlacementId(data.currentAssignmentId)) throw new Error(PENDING_PLACEMENT_NOT_ASSIGNED_MESSAGE);
      if (!data.userId) throw new Error(PENDING_PLACEMENT_NOT_ASSIGNED_MESSAGE);
      const now = new Date().toISOString();
      const notes = data.notes?.trim() || null;
      const previous = await snapshotAssignment(data.currentAssignmentId);

      // Rank travels with the crew member, not the assignment they leave.
      const { data: crewProfile } = await supabase
        .from('profiles')
        .select('rank')
        .eq('user_id', data.userId)
        .maybeSingle();

      // End current assignment
      const closedValues = {
        is_current: false,
        leave_date: data.transferDate,
        end_date: data.transferDate,
        end_reason: 'transfer',
        ...(notes ? { notes } : {}),
        updated_by: user?.id ?? null,
        updated_at: now,
      };
      const { data: ended, error: endError } = await supabase
        .from('crew_assignments')
        .update(closedValues)
        .eq('id', data.currentAssignmentId)
        .select('id');

      if (endError) throw new Error(crewRefusalMessage(endError));
      if (!ended || ended.length === 0) throw new Error(ASSIGNMENT_NOT_CHANGED_MESSAGE);
      await logAssignmentAudit(data.currentAssignmentId, 'UPDATE', previous, closedValues);

      // Create new assignment
      const newValues = {
        user_id: data.userId,
        vessel_id: data.newVesselId,
        position: data.position,
        rank: crewProfile?.rank ?? (previous?.rank as string | null | undefined) ?? null,
        department: (previous?.department as string | null | undefined) ?? null,
        join_date: data.transferDate,
        start_date: data.transferDate,
        is_current: true,
        notes,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      };
      const { data: created, error: createError } = await supabase
        .from('crew_assignments')
        .insert(newValues)
        .select('id')
        .maybeSingle();

      if (createError) throw new CrewTransferPartialError(crewRefusalMessage(createError));
      if (!created?.id) throw new CrewTransferPartialError(ASSIGNMENT_NOT_CHANGED_MESSAGE);
      await logAssignmentAudit(created.id, 'CREATE', null, newValues);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-changes'] });
      queryClient.invalidateQueries({ queryKey: ['hris'] });
      toast({
        title: 'Success',
        description: 'Crew member transferred successfully',
      });
    },
    onError: (error: Error) => {
      if (error instanceof CrewTransferPartialError) {
        // The old assignment did end: the list must show that.
        queryClient.invalidateQueries({ queryKey: ['crew'] });
        queryClient.invalidateQueries({ queryKey: ['hris'] });
        notify.warning('Partly saved', { description: error.message });
        return;
      }
      toast({
        title: 'Not transferred',
        description: crewRefusalMessage(error),
        variant: 'destructive',
      });
    },
  });

  /** End a current assignment. Refused for a pending placement; zero rows changed is a refusal. */
  const signOffCrew = useMutation({
    mutationFn: async ({ assignmentId, leaveDate, reason, notes }: SignOffCrewData) => {
      if (isPendingPlacementId(assignmentId)) throw new Error(PENDING_PLACEMENT_NOT_ASSIGNED_MESSAGE);
      const previous = await snapshotAssignment(assignmentId);
      const trimmedNotes = notes?.trim();
      const values = {
        is_current: false,
        leave_date: leaveDate,
        end_date: leaveDate,
        ...(reason ? { end_reason: reason } : {}),
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data: ended, error } = await supabase
        .from('crew_assignments')
        .update(values)
        .eq('id', assignmentId)
        .select('id');

      if (error) throw new Error(crewRefusalMessage(error));
      if (!ended || ended.length === 0) throw new Error(ASSIGNMENT_NOT_CHANGED_MESSAGE);
      await logAssignmentAudit(assignmentId, 'UPDATE', previous, values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-changes'] });
      queryClient.invalidateQueries({ queryKey: ['hris'] });
      toast({
        title: 'Success',
        description: 'Crew member signed off successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Not signed off',
        description: crewRefusalMessage(error),
        variant: 'destructive',
      });
    },
  });

  /**
   * Mark a profile inactive and end its current assignments. The profile
   * write must report its row; every current assignment must end, or the
   * outcome is a partial save.
   */
  const deactivateCrew = useMutation({
    mutationFn: async (userId: string) => {
      if (!userId) throw new Error(CREW_NOT_CHANGED_MESSAGE);
      // Mark profile as inactive
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({ status: 'Inactive' })
        .eq('user_id', userId)
        .select('id');

      if (error) throw new Error(crewRefusalMessage(error));
      if (!updated || updated.length === 0) throw new Error(CREW_NOT_CHANGED_MESSAGE);

      // End any current assignments
      const today = localToday();
      const { data: current } = await supabase
        .from('crew_assignments')
        .select(ASSIGNMENT_AUDIT_COLUMNS)
        .eq('user_id', userId)
        .eq('is_current', true);
      const values = {
        is_current: false,
        leave_date: today,
        end_date: today,
        end_reason: 'deactivated',
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      const { data: ended, error: endError } = await supabase
        .from('crew_assignments')
        .update(values)
        .eq('user_id', userId)
        .eq('is_current', true)
        .select('id');
      const currentRows = (current ?? []) as AssignmentAuditSnapshot[];
      if (endError) throw new CrewTransferPartialError(crewRefusalMessage(endError), DEACTIVATE_PARTIAL_PREFIX);
      if ((ended?.length ?? 0) < currentRows.length) throw new CrewTransferPartialError(ASSIGNMENT_NOT_CHANGED_MESSAGE, DEACTIVATE_PARTIAL_PREFIX);
      for (const row of currentRows) {
        if (row?.id) await logAssignmentAudit(String(row.id), 'UPDATE', row, values);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      queryClient.invalidateQueries({ queryKey: ['crew-count'] });
      queryClient.invalidateQueries({ queryKey: ['crew-changes'] });
      queryClient.invalidateQueries({ queryKey: ['hris'] });
      toast({
        title: 'Success',
        description: 'Crew member deactivated',
      });
    },
    onError: (error: Error) => {
      if (error instanceof CrewTransferPartialError) {
        queryClient.invalidateQueries({ queryKey: ['crew'] });
        queryClient.invalidateQueries({ queryKey: ['crew-count'] });
        notify.warning('Partly saved', { description: error.message });
        return;
      }
      toast({
        title: 'Not deactivated',
        description: crewRefusalMessage(error),
        variant: 'destructive',
      });
    },
  });

  return {
    crew: crewQuery.data ?? [],
    isLoading: crewQuery.isLoading,
    error: crewQuery.error,
    refetch: crewQuery.refetch,
    addCrewMember,
    updateCrewMember,
    transferCrew,
    signOffCrew,
    deactivateCrew,
  };
};

/**
 * Why `useCrewCount` has no number when it fails for a known reason: the
 * signed-in account has no company to count for (D-103 follow-up, Phase 1
 * round 3). A Retry cannot help that.
 */
export class CrewCountNoCompanyError extends Error {
  readonly reason = 'no-company' as const;
  constructor() {
    super('No company on your account');
    this.name = 'CrewCountNoCompanyError';
  }
}

/**
 * Active crew of the company, for the dashboards. Nothing is read until the
 * session and the profile have loaded; then an account with no company is
 * an error (`CrewCountNoCompanyError`, reason `no-company`), not an endless
 * skeleton and not a made-up 0. The query result is otherwise unchanged.
 */
export const useCrewCount = () => {
  const { profile, user, loading, profileResolved } = useAuth();
  const settled = !loading && Boolean(user) && profileResolved;

  return useQuery({
    queryKey: ['crew-count', profile?.company_id ?? null],
    queryFn: async () => {
      if (!profile?.company_id) throw new CrewCountNoCompanyError();

      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('status', 'Active');

      if (error) throw error;
      return count ?? 0;
    },
    enabled: settled,
    retry: (failureCount, error) => !(error instanceof CrewCountNoCompanyError) && failureCount < 3,
  });
};

// Get recent crew changes for dashboard
export const useRecentCrewChanges = (limit = 5) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['crew-changes', profile?.company_id, limit],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      // Get recent assignments/changes
      const { data, error } = await supabase
        .from('crew_assignments')
        .select(`
          id,
          position,
          join_date,
          leave_date,
          is_current,
          created_at,
          vessels (id, name),
          profiles!crew_assignments_user_id_fkey (first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((change) => ({
        id: change.id,
        crewName: `${(change.profiles as any)?.first_name || ''} ${(change.profiles as any)?.last_name || ''}`.trim(),
        vesselName: (change.vessels as any)?.name || 'Unknown',
        position: change.position,
        joinDate: change.join_date,
        leaveDate: change.leave_date,
        isCurrent: change.is_current,
        createdAt: change.created_at,
        type: change.leave_date ? 'sign_off' : 'join',
      }));
    },
    enabled: !!profile?.company_id,
  });
};

// Get single crew member details
export const useCrewMember = (userId: string) => {
  return useQuery({
    queryKey: ['crew-member', userId],
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) throw new Error('Crew member not found');

      // Get all assignments for this crew member
      const { data: assignments, error: assignmentsError } = await supabase
        .from('crew_assignments')
        .select(`
          id,
          vessel_id,
          position,
          join_date,
          leave_date,
          is_current,
          vessels (id, name)
        `)
        .eq('user_id', userId)
        .order('join_date', { ascending: false });

      if (assignmentsError) throw assignmentsError;

      return {
        ...profile,
        assignments: (assignments || []).map((a) => ({
          id: a.id,
          vesselId: a.vessel_id,
          vesselName: (a.vessels as any)?.name || 'Unknown',
          position: a.position,
          joinDate: a.join_date,
          leaveDate: a.leave_date,
          isCurrent: a.is_current,
        })),
      };
    },
    enabled: !!userId,
  });
};
