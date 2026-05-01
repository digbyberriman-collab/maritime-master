import React, { useState } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Repeat } from 'lucide-react';
import { DayTimeline, mergeBlocks } from './DayTimeline';
import { DailyRecord, WorkRestBlock } from '../types';
import { ComplianceResult } from '../types';

interface Props {
  year: number;
  month: number;
  records: DailyRecord[];
  compliance: ComplianceResult;
  disabled?: boolean;
  onChangeDay: (date: string, blocks: WorkRestBlock[], notes?: string | null) => void;
  onApplyPattern?: (
    fromDate: string,
    toDate: string,
    pattern: WorkRestBlock[]
  ) => void;
}

export const MonthCalendar: React.FC<Props> = ({
  year,
  month,
  records,
  compliance,
  disabled,
  onChangeDay,
  onApplyPattern,
}) => {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const [pasteSourceDate, setPasteSourceDate] = useState<string | null>(null);

  const recordMap = new Map(records.map((r) => [r.record_date, r]));
  const summaryMap = new Map(compliance.daily_summary.map((d) => [d.date, d]));

  const copyDay = (date: string) => setPasteSourceDate(date);

  const pasteToDay = (target: string) => {
    if (!pasteSourceDate) return;
    const source = recordMap.get(pasteSourceDate);
    if (!source) return;
    onChangeDay(
      target,
      source.blocks.map((b) => ({
        block_type: b.block_type,
        category: b.category,
        start_minute: b.start_minute,
        end_minute: b.end_minute,
        notes: b.notes,
      })),
      source.notes ?? null
    );
  };

  const applyToWeek = (date: string) => {
    if (!onApplyPattern) return;
    const source = recordMap.get(date);
    if (!source) return;
    const start = new Date(date);
    const dow = start.getDay();
    const monday = new Date(start);
    monday.setDate(start.getDate() - ((dow + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    onApplyPattern(format(monday, 'yyyy-MM-dd'), format(sunday, 'yyyy-MM-dd'), source.blocks);
  };

  return (
    <div className="space-y-2">
      {pasteSourceDate && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-2 flex items-center justify-between text-sm">
            <span>
              Pattern copied from <strong>{pasteSourceDate}</strong>. Click any day to
              paste.
            </span>
            <Button size="sm" variant="ghost" onClick={() => setPasteSourceDate(null)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const record = recordMap.get(dateStr);
          const summary = summaryMap.get(dateStr);
          const isCompliant = summary?.is_compliant ?? true;
          const restMinutes = summary?.rest_minutes ?? 1440;
          const workMinutes = summary?.work_minutes ?? 0;

          return (
            <Card
              key={dateStr}
              className={`${
                isCompliant
                  ? 'border-success/40'
                  : 'border-destructive/50 bg-destructive/5'
              }`}
            >
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="text-center min-w-[3rem]">
                      <div className="text-xs uppercase text-muted-foreground">
                        {format(day, 'EEE')}
                      </div>
                      <div className="text-lg font-semibold leading-none">
                        {format(day, 'd')}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        isCompliant
                          ? 'border-success text-success'
                          : 'border-destructive text-destructive'
                      }
                    >
                      Work {(workMinutes / 60).toFixed(1)}h · Rest {(restMinutes / 60).toFixed(1)}h
                    </Badge>
                    {summary && summary.rest_period_count > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {summary.rest_period_count} rest period
                        {summary.rest_period_count === 1 ? '' : 's'} · longest{' '}
                        {(summary.longest_rest_minutes / 60).toFixed(1)}h
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {pasteSourceDate && pasteSourceDate !== dateStr ? (
                      <Button size="sm" variant="outline" onClick={() => pasteToDay(dateStr)} disabled={disabled}>
                        Paste here
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyDay(dateStr)}
                        disabled={disabled || !record || record.blocks.length === 0}
                        title="Copy day's pattern"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    {onApplyPattern && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => applyToWeek(dateStr)}
                        disabled={disabled || !record || record.blocks.length === 0}
                        title="Apply to whole week"
                      >
                        <Repeat className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <DayTimeline
                  date={dateStr}
                  blocks={record?.blocks ?? []}
                  disabled={disabled}
                  onChange={(blocks) => onChangeDay(dateStr, mergeBlocks(blocks))}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
