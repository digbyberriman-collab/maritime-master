/**
 * The Status tab's row model: one crew member with their requirement rows
 * and the four tab cells, built once per answer so the matrices and the
 * cards never recompute them per cell.
 */
import { COMPLIANCE_TABS, requirementExplanation, type ComplianceTab } from '@/modules/crew/lib/compliance';
import { tabCell, type StatusRowLike, type TabCell } from '@/modules/crew/lib/complianceModel';
import type { CrewComplianceSummary, CrewRequirementStatusRow } from '@/modules/crew/hooks/useVesselCompliance';

export interface ComplianceRowModel {
  person: CrewComplianceSummary;
  rows: readonly CrewRequirementStatusRow[];
  tabs: Readonly<Record<ComplianceTab, TabCell>>;
}

const NO_ROWS: readonly CrewRequirementStatusRow[] = [];

export function buildRowModels(
  people: readonly CrewComplianceSummary[],
  statusByProfile: ReadonlyMap<string, readonly CrewRequirementStatusRow[]>,
): ComplianceRowModel[] {
  return people.map((person) => {
    const rows = statusByProfile.get(person.profileId) ?? NO_ROWS;
    const tabs = Object.fromEntries(COMPLIANCE_TABS.map((t) => [t, tabCell(rows, t)])) as Record<ComplianceTab, TabCell>;
    return { person, rows, tabs };
  });
}

/** The sentence of a requirement cell (lib/compliance.ts requirementExplanation). */
export const explain = (s: StatusRowLike): string => requirementExplanation(s);
