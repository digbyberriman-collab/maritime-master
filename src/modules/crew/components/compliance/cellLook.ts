/**
 * The look and words of the crew compliance cells (gap/04 C35, C5): the
 * icon of each state (a distinct shape, so a state never reads by colour
 * alone), its tone from the status registry, the sentences of a tab cell
 * and of the crew list's dots, and the short words of a document type.
 * Plain values and functions, so the component files export components
 * only.
 */
import { AlertOctagon, Check, CircleDashed, Clock, Minus, type LucideIcon } from 'lucide-react';
import { statusMeta, type Tone } from '@/shared/components/status';
import type { ComplianceDot, RequirementState } from '@/modules/crew/lib/compliance';
import { STATUS_VIEW_LABEL, dotIssues, issueText, monthText, type CellState, type DotKind, type TabCell } from '@/modules/crew/lib/complianceModel';
import type { CrewComplianceSummary } from '@/modules/crew/hooks/useVesselCompliance';
import type { DocumentType } from '@/modules/crew/hooks/useDocumentTypes';

/** The icon of a requirement state (a distinct shape for each, so print and colour-blind readers tell them apart). */
export const STATE_ICON: Readonly<Record<CellState, LucideIcon>> = {
  met: Check,
  expiring: Clock,
  expired: AlertOctagon,
  missing: CircleDashed,
  not_required: Minus,
};

export const stateTone = (state: CellState, caution = false): Tone =>
  state === 'not_required' ? 'neutral' : caution && state === 'met' ? 'warn' : statusMeta('crew_requirement', state).tone;

/** The state word of a requirement (lists and cards). */
export const stateWord = (state: RequirementState): string => statusMeta('crew_requirement', state).label;

/** The view label of a tab (the cards' chips). */
export const tabLabel = (tab: TabCell['tab']): string => STATUS_VIEW_LABEL[tab];

const TAB_NOUN: Readonly<Record<TabCell['tab'], string>> = {
  documents: 'document requirements',
  stcw: 'STCW requirements',
  qualifications: 'qualification requirements',
  familiarisation: 'familiarisations',
};

/** The sentence of a tab cell: "3 of 5 STCW requirements met. Needs a look: PSSR, FPFF." */
export function tabCellSentence(cell: TabCell): string {
  if (cell.required === 0) return `No ${TAB_NOUN[cell.tab]} for this position.`;
  const parts = [`${cell.met} of ${cell.required} ${TAB_NOUN[cell.tab]} met.`];
  if (cell.gaps.length) parts.push(`Needs a look: ${cell.gaps.join(', ')}.`);
  else if (cell.caution) parts.push('One or more is conditionally approved, has no expiry date or has its alerts off.');
  if (cell.next) parts.push(`Next to expire: ${cell.next.name ?? 'a document'} in ${monthText(cell.next.date) ?? cell.next.date}.`);
  return parts.join(' ');
}

// ---------------------------------------------------------------- the crew list's dots (C5)

export const DOT_ICON: Readonly<Record<ComplianceDot, LucideIcon>> = { none: Minus, ok: Check, warn: Clock, danger: AlertOctagon };
export const DOT_TONE: Readonly<Record<ComplianceDot, Tone>> = { none: 'neutral', ok: 'ok', warn: 'warn', danger: 'danger' };
export const DOT_WORD: Readonly<Record<ComplianceDot, string>> = {
  none: 'nothing required',
  ok: 'all held',
  warn: 'needs a look soon',
  danger: 'missing or expired',
};

const DOT_NAME: Readonly<Record<DotKind, string>> = { documents: 'Documents', qualifications: 'STCW and qualifications' };

/** "Documents: all held. STCW and qualifications: missing or expired (PSSR: missing; FPFF: expired)." */
export function dotsSentence(summary: Pick<CrewComplianceSummary, 'dotDocuments' | 'dotQualifications' | 'issues'>): string {
  return (['documents', 'qualifications'] as const)
    .map((kind) => {
      const dot = kind === 'documents' ? summary.dotDocuments : summary.dotQualifications;
      const reasons = dotIssues(summary.issues, kind).map(issueText);
      return `${DOT_NAME[kind]}: ${DOT_WORD[dot]}${reasons.length ? ` (${reasons.join('; ')})` : ''}.`;
    })
    .join(' ');
}

// ---------------------------------------------------------------- document types

/** "PST · STCW A-VI/1-1": the type's short code and regulation. */
export function typeDetail(type: Pick<DocumentType, 'abbreviation' | 'code' | 'name' | 'stcwReference'>): string | null {
  const parts = [type.abbreviation && type.abbreviation !== type.name ? type.abbreviation : type.code, type.stcwReference].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length ? [...new Set(parts)].join(' · ') : null;
}
