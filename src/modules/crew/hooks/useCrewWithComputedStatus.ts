import { useMemo } from 'react';
import { addDays } from 'date-fns';
import { useCrew, type CrewMember } from '@/modules/crew/hooks/useCrew';

export type CertStatus = 'expired' | 'expiring' | 'valid' | 'missing';
export type MedicalStatus = CertStatus;

export interface CrewStatusFlags {
  certStatus: CertStatus;
  earliestCertExpiry: Date | null;
  expiringCount: number;
  medicalStatus: MedicalStatus;
  contractEndingSoon: boolean;
  isOnLeave: boolean;
  isOnboard: boolean;
  hasAssignment: boolean;
}

export type CrewMemberWithStatus = CrewMember & CrewStatusFlags;

const HORIZON_DAYS = 90;

export const computeCrewStatus = (member: CrewMember, now: Date = new Date()): CrewStatusFlags => {
  const horizon = addDays(now, HORIZON_DAYS);
  const certs = member.crew_certificates ?? [];

  const parsed = certs
    .map((c) => (c.expiry_date ? new Date(c.expiry_date) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));

  const expired = parsed.filter((d) => d < now);
  const expiring = parsed.filter((d) => d >= now && d <= horizon);
  const earliestCertExpiry = parsed.length
    ? parsed.slice().sort((a, b) => a.getTime() - b.getTime())[0]
    : null;

  const certStatus: CertStatus = expired.length
    ? 'expired'
    : expiring.length
    ? 'expiring'
    : certs.length
    ? 'valid'
    : 'missing';

  const medExpiryStr = member.medical_expiry;
  const medExpiry = medExpiryStr ? new Date(medExpiryStr) : null;
  const medicalStatus: MedicalStatus = !medExpiry || Number.isNaN(medExpiry.getTime())
    ? 'missing'
    : medExpiry < now
    ? 'expired'
    : medExpiry <= horizon
    ? 'expiring'
    : 'valid';

  const contractEnd = member.contract_end_date ? new Date(member.contract_end_date) : null;
  const contractEndingSoon = !!(contractEnd && !Number.isNaN(contractEnd.getTime()) && contractEnd <= horizon);

  const accountStatus = (member.account_status || member.status || '').toLowerCase();
  const isOnLeave = accountStatus === 'on_leave' || accountStatus === 'on leave';
  const hasAssignment = !!member.current_assignment;
  const isOnboard = hasAssignment && !isOnLeave;

  return {
    certStatus,
    earliestCertExpiry,
    expiringCount: expiring.length,
    medicalStatus,
    contractEndingSoon,
    isOnLeave,
    isOnboard,
    hasAssignment,
  };
};

export const useCrewWithComputedStatus = (vesselFilter?: string) => {
  const { crew, isLoading, error, refetch, ...mutations } = useCrew(vesselFilter);
  const data = useMemo<CrewMemberWithStatus[]>(() => {
    const now = new Date();
    return (crew ?? []).map((m) => ({ ...m, ...computeCrewStatus(m, now) }));
  }, [crew]);

  return { data, isLoading, error, refetch, ...mutations };
};
