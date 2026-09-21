import { useMemo } from 'react';
import { useConsultations, ESCALATED_OUTCOMES } from '@/modules/health/hooks/useConsultations';
import { useFitnessStatus } from '@/modules/health/hooks/useFitnessAssessments';
import { useSupplyItems } from '@/modules/health/hooks/useMedicalStores';
import { useMedicalEquipment, useFirstAidKits } from '@/modules/health/hooks/useMedicalEquipment';
import { useHealthExpiryItems, useReferrals } from '@/modules/health/hooks/useReferrals';
import { useScreeningRecords } from '@/modules/health/hooks/useScreening';
import { useAllergies } from '@/modules/health/hooks/usePatientRecord';
import { addDaysIso, todayIso } from '@/modules/health/lib/format';

export interface MedicalDashboardData {
  loading: boolean;
  fitness: ReturnType<typeof useFitnessStatus>['summary'];
  stores: ReturnType<typeof useSupplyItems>['summary'];
  equipment: ReturnType<typeof useMedicalEquipment>['summary'];
  kits: ReturnType<typeof useFirstAidKits>['summary'];
  referrals: ReturnType<typeof useReferrals>['summary'];
  screening: ReturnType<typeof useScreeningRecords>['summary'];
  expiry: ReturnType<typeof useHealthExpiryItems>;
  consultations: {
    last30: number;
    openFollowUps: number;
    escalated30: number;
    daysLost30: number;
    currentlyUnfit: number;
  };
  severeAllergies: number;
}

/**
 * Everything the medical dashboard shows, assembled from the individual
 * resources so each page and the dashboard read the same numbers.
 */
export function useMedicalDashboard(): MedicalDashboardData {
  const since = useMemo(() => addDaysIso(todayIso(), -30), []);
  const fitness = useFitnessStatus();
  const stores = useSupplyItems();
  const equipment = useMedicalEquipment();
  const kits = useFirstAidKits();
  const referrals = useReferrals({ openOnly: false });
  const screening = useScreeningRecords();
  const expiry = useHealthExpiryItems(90);
  const consultations = useConsultations({ since: `${since}T00:00:00Z`, limit: 500 });
  const allergies = useAllergies({ activeOnly: true });

  const consultationSummary = useMemo(() => {
    const rows = consultations.consultations;
    const today = todayIso();
    return {
      last30: rows.length,
      openFollowUps: rows.filter((c) => c.follow_up_on && c.follow_up_on >= today).length,
      escalated30: rows.filter((c) => ESCALATED_OUTCOMES.includes(c.outcome)).length,
      daysLost30: rows.reduce((sum, c) => sum + (c.days_off_work ?? 0), 0),
      currentlyUnfit: rows.filter((c) => c.fit_for_duty === 'unfit').length,
    };
  }, [consultations.consultations]);

  const severeAllergies = useMemo(
    () => allergies.allergies.filter((a) => a.severity === 'severe' || a.severity === 'anaphylaxis').length,
    [allergies.allergies],
  );

  return {
    loading:
      fitness.isLoading ||
      stores.isLoading ||
      equipment.isLoading ||
      kits.isLoading ||
      referrals.isLoading ||
      screening.isLoading ||
      consultations.isLoading,
    fitness: fitness.summary,
    stores: stores.summary,
    equipment: equipment.summary,
    kits: kits.summary,
    referrals: referrals.summary,
    screening: screening.summary,
    expiry,
    consultations: consultationSummary,
    severeAllergies,
  };
}
