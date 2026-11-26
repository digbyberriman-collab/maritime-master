/**
 * A person's hours-of-rest month on a vessel (gap/04 C37-C39; D-X1-9,
 * D-X1-20): the month row, the day records with the six days before the
 * month as context (its first week's 7-day windows), the rule set with the
 * vessel's margins, the breaches and signatures, and local edits until
 * `save()`.
 *
 * Saving goes through the engine (work_rest_save_day: the server computes
 * and stores the breaches). While the engine is missing (D-01; the service's
 * `isEngineMissing`) the legacy path runs instead: the day, its blocks and
 * the breaches computed here are written directly, as before. A refusal
 * (`WorkRestRefusal`, the server's sentence) or any other error is thrown to
 * the caller, after the days already saved are cleared from the edits.
 *
 * `compliance` is computed here for the screen (the same engine as the
 * server's, lib/complianceEngine.ts) over the month's days, with the
 * context days counted but not answered.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calculateCompliance } from '../lib/complianceEngine';
import { isMonthOpen } from '../lib/horMonth';
import { ComplianceResult, DailyRecord, DEFAULT_RULE_SET, RuleSet, WorkRestBlock } from '../types';
import {
  getOrCreateSubmission,
  listNonConformities,
  listSignatures,
  loadEffectiveRuleSet,
  loadMonthRecords,
  loadRecordsBetween,
  logAudit,
  monthContextRange,
  MonthlySubmission,
  NonConformityListRow,
  replaceMonthNonConformities,
  saveDay,
  SignatureListRow,
  upsertDayRecord,
} from '../services/workRestService';
import { workRestKeys } from './workRestKeys';

interface UseMonthlyWorkRestOpts {
  crewId: string;
  vesselId: string;
  year: number;
  month: number; // 1-12
  actorId: string;
  actorRole?: string | null;
}

/** Which path saved last: the engine, the legacy writes, or nothing saved yet. */
export type WorkRestSavePath = 'unknown' | 'engine' | 'legacy';

export interface MonthlyWorkRestData {
  submission: MonthlySubmission;
  ruleSet: RuleSet;
  records: DailyRecord[];
  context: DailyRecord[];
  nonConformities: NonConformityListRow[];
  signatures: SignatureListRow[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The first and last day of a month, YYYY-MM-DD. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(last)}` };
}

/** The month's records with the local edits laid over them, by date. */
export function mergeEdits(records: readonly DailyRecord[], edits: ReadonlyMap<string, DailyRecord>): DailyRecord[] {
  const byDate = new Map(records.map((r) => [r.record_date, r]));
  for (const [date, edit] of edits) byDate.set(date, edit);
  return Array.from(byDate.values()).sort((a, b) => a.record_date.localeCompare(b.record_date));
}

export async function loadMonthlyWorkRest(opts: { crewId: string; vesselId: string; year: number; month: number }): Promise<MonthlyWorkRestData> {
  const ctx = monthContextRange(opts.year, opts.month);
  const [submission, ruleSet, records, context] = await Promise.all([
    getOrCreateSubmission(opts),
    loadEffectiveRuleSet(opts.vesselId),
    loadMonthRecords(opts.crewId, opts.year, opts.month),
    loadRecordsBetween(opts.crewId, ctx.from, ctx.to),
  ]);
  const [nonConformities, signatures] = await Promise.all([listNonConformities(submission.id), listSignatures(submission.id)]);
  return { submission, ruleSet, records, context, nonConformities, signatures };
}

export function useMonthlyWorkRest({ crewId, vesselId, year, month, actorId, actorRole }: UseMonthlyWorkRestOpts) {
  const queryClient = useQueryClient();
  const enabled = Boolean(crewId && vesselId);
  const query = useQuery({
    queryKey: workRestKeys.month(vesselId, crewId, year, month),
    queryFn: () => loadMonthlyWorkRest({ crewId, vesselId, year, month }),
    enabled,
  });

  const [edits, setEdits] = useState<Map<string, DailyRecord>>(() => new Map());
  const [saving, setSaving] = useState(false);
  const [savePath, setSavePath] = useState<WorkRestSavePath>('unknown');
  useEffect(() => setEdits(new Map()), [crewId, vesselId, year, month]);

  const data = query.data;
  const submission = data?.submission ?? null;
  const ruleSet = data?.ruleSet ?? DEFAULT_RULE_SET;
  const records = useMemo(() => mergeEdits(data?.records ?? [], edits), [data?.records, edits]);
  const range = useMemo(() => monthRange(year, month), [year, month]);
  const compliance: ComplianceResult = useMemo(
    () => calculateCompliance([...(data?.context ?? []), ...records], ruleSet, { defaultUnmarkedAsRest: true, range }),
    [data?.context, records, ruleSet, range],
  );

  /** Local-only block update for a single day; the day stays dirty until save(). */
  const setDayBlocks = useCallback(
    (date: string, blocks: WorkRestBlock[], notes?: string | null) => {
      setEdits((prev) => {
        const next = new Map(prev);
        const found = prev.get(date) ?? data?.records.find((r) => r.record_date === date);
        next.set(date, {
          crew_id: crewId,
          vessel_id: vesselId,
          record_date: date,
          blocks,
          notes: notes ?? found?.notes ?? null,
          submission_id: submission?.id,
          id: found?.id,
        });
        return next;
      });
    },
    [crewId, vesselId, submission?.id, data?.records],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: workRestKeys.person(vesselId, crewId) });
  }, [queryClient, vesselId, crewId]);

  /** Today's legacy writes (only while the engine is missing). */
  const saveLegacy = useCallback(
    async (month: MonthlySubmission, dates: string[]) => {
      const summaries = new Map(compliance.daily_summary.map((d) => [d.date, d]));
      for (const date of dates) {
        const rec = edits.get(date);
        if (!rec) continue;
        const summary = summaries.get(date);
        await upsertDayRecord({
          submissionId: month.id,
          crewId,
          vesselId,
          date,
          blocks: rec.blocks,
          notes: rec.notes ?? null,
          summary: {
            work_minutes: summary?.work_minutes ?? 0,
            rest_minutes: summary?.rest_minutes ?? 1440,
            longest_rest_minutes: summary?.longest_rest_minutes ?? 1440,
            rest_period_count: summary?.rest_period_count ?? 1,
            is_compliant: summary?.is_compliant ?? true,
          },
        });
      }
      await replaceMonthNonConformities(month.id, crewId, compliance.non_conformities.map((n) => ({ ...n, submission_id: month.id })));
      await logAudit({
        submissionId: month.id,
        crewId,
        actorId,
        actorRole,
        action: 'records_saved',
        metadata: { days_changed: dates },
      });
    },
    [compliance, edits, crewId, vesselId, actorId, actorRole],
  );

  /** Persists the dirty days; refreshes the month afterwards. */
  const save = useCallback(async () => {
    if (!submission) return;
    if (submission.status === 'locked') {
      throw new Error('This monthly record is locked. Reopen it before editing.');
    }
    const dates = Array.from(edits.keys()).sort();
    if (!dates.length) return;
    setSaving(true);
    const saved: string[] = [];
    try {
      let legacy = false;
      for (const date of dates) {
        const rec = edits.get(date);
        if (!rec) continue;
        const call = await saveDay({ vesselId, crewId, date, blocks: rec.blocks, note: rec.notes ?? null });
        if (!call.applied) {
          legacy = true;
          break;
        }
        saved.push(date);
      }
      if (legacy) {
        await saveLegacy(submission, dates);
        saved.push(...dates);
      }
      setSavePath(legacy ? 'legacy' : 'engine');
    } finally {
      if (saved.length) {
        setEdits((prev) => {
          const next = new Map(prev);
          for (const d of saved) next.delete(d);
          return next;
        });
        await refresh();
      }
      setSaving(false);
    }
  }, [submission, edits, vesselId, crewId, saveLegacy, refresh]);

  return {
    submission,
    records,
    ruleSet,
    nonConformities: data?.nonConformities ?? [],
    signatures: data?.signatures ?? [],
    compliance,
    loading: query.isPending,
    saving,
    error: query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null,
    isLocked: submission?.status === 'locked',
    /** Days can be saved (draft or reopened); a submitted, approved or locked month refuses them once the engine is applied. */
    isOpen: submission ? isMonthOpen(submission.status) : false,
    isDirty: edits.size > 0,
    savePath,
    refresh,
    setDayBlocks,
    save,
  };
}
