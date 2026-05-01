import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateCompliance } from '../lib/complianceEngine';
import {
  DailyRecord,
  RuleSet,
  WorkRestBlock,
  DEFAULT_RULE_SET,
  ComplianceResult,
} from '../types';
import {
  getOrCreateSubmission,
  loadMonthRecords,
  loadEffectiveRuleSet,
  listNonConformities,
  listSignatures,
  logAudit,
  MonthlySubmission,
  replaceMonthNonConformities,
  upsertDayRecord,
} from '../services/workRestService';

interface UseMonthlyWorkRestOpts {
  crewId: string;
  vesselId: string;
  year: number;
  month: number; // 1-12
  actorId: string;
  actorRole?: string | null;
}

export function useMonthlyWorkRest({
  crewId,
  vesselId,
  year,
  month,
  actorId,
  actorRole,
}: UseMonthlyWorkRestOpts) {
  const [submission, setSubmission] = useState<MonthlySubmission | null>(null);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [ruleSet, setRuleSet] = useState<RuleSet>(DEFAULT_RULE_SET);
  const [nonConformities, setNonConformities] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const dirtyDays = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!crewId || !vesselId) return;
    setLoading(true);
    try {
      const [sub, rs, recs] = await Promise.all([
        getOrCreateSubmission({ crewId, vesselId, year, month }),
        loadEffectiveRuleSet(vesselId),
        loadMonthRecords(crewId, year, month),
      ]);
      setSubmission(sub);
      setRuleSet(rs);
      setRecords(recs);
      const [ncs, sigs] = await Promise.all([
        listNonConformities(sub.id),
        listSignatures(sub.id),
      ]);
      setNonConformities(ncs);
      setSignatures(sigs);
      setError(null);
    } catch (e) {
      console.error('[work-rest] load failed:', e);
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [crewId, vesselId, year, month]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Local-only block update for a single day. Marks the day dirty until save().
   */
  const setDayBlocks = useCallback(
    (date: string, blocks: WorkRestBlock[], notes?: string | null) => {
      setRecords((prev) => {
        const others = prev.filter((r) => r.record_date !== date);
        const found = prev.find((r) => r.record_date === date);
        const updated: DailyRecord = {
          crew_id: crewId,
          vessel_id: vesselId,
          record_date: date,
          blocks,
          notes: notes ?? found?.notes ?? null,
          submission_id: submission?.id,
          id: found?.id,
        };
        return [...others, updated].sort((a, b) =>
          a.record_date.localeCompare(b.record_date)
        );
      });
      dirtyDays.current.add(date);
    },
    [crewId, vesselId, submission?.id]
  );

  /**
   * The full compliance picture for the loaded month, recomputed on the fly.
   */
  const compliance: ComplianceResult = useMemo(
    () => calculateCompliance(records, ruleSet, { defaultUnmarkedAsRest: true }),
    [records, ruleSet]
  );

  /**
   * Persist any dirty days, refresh non-conformities and audit-log.
   */
  const save = useCallback(async () => {
    if (!submission) return;
    if (submission.status === 'locked') {
      throw new Error('This monthly record is locked. Reopen it before editing.');
    }
    setSaving(true);
    try {
      const dailySummaries = new Map(
        compliance.daily_summary.map((d) => [d.date, d])
      );

      for (const date of Array.from(dirtyDays.current)) {
        const rec = records.find((r) => r.record_date === date);
        if (!rec) continue;
        const summary = dailySummaries.get(date);
        await upsertDayRecord({
          submissionId: submission.id,
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

      // Replace non-conformities with the freshly calculated set
      await replaceMonthNonConformities(
        submission.id,
        crewId,
        compliance.non_conformities.map((n) => ({ ...n, submission_id: submission.id }))
      );

      await logAudit({
        submissionId: submission.id,
        crewId,
        actorId,
        actorRole,
        action: 'records_saved',
        metadata: { days_changed: Array.from(dirtyDays.current) },
      });

      dirtyDays.current.clear();
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [submission, compliance, records, crewId, vesselId, actorId, actorRole, refresh]);

  const isLocked = submission?.status === 'locked';
  const isDirty = dirtyDays.current.size > 0;

  return {
    submission,
    records,
    ruleSet,
    nonConformities,
    signatures,
    compliance,
    loading,
    saving,
    error,
    isLocked,
    isDirty,
    refresh,
    setDayBlocks,
    save,
  };
}
