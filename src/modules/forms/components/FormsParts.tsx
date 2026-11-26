/**
 * Small shared pieces of the Forms & Checklists pages (gap/02 FC1–FC6):
 * the origin chip, the "Showing" choice (the whole fleet or one vessel,
 * `?vessel=<CODE>`), the freshness stamp with Refresh (D-88), the D-01
 * notices and the in-scope "not found".
 *
 * Tokens only; 44 px targets on coarse pointers; usable at 390 px.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Info, RefreshCw, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { EmptyState } from '@/shared/components/states';
import { StatusPill, type Tone } from '@/shared/components/status';
import { ORIGIN_LABELS, formatUpdatedUtc, originKind, type CatalogueTemplate, type OriginKind, type Showing, type ShowingVessel } from '../lib/catalogueModel';
import { fleetFormsPath } from '../paths';

export const COARSE = '[@media(pointer:coarse)]:min-h-11';
export const COARSE_ICON = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';

const ORIGIN_TONE: Readonly<Record<OriginKind, Tone>> = { standard: 'purple', customised: 'info', company: 'neutral' };

/** Standard (a platform template), Customised (a copy) or Company (the company's own). */
export function OriginChip({ template }: { template: Pick<CatalogueTemplate, 'origin' | 'sourceTemplateId'> }) {
  const kind = originKind(template);
  return <StatusPill tone={ORIGIN_TONE[kind]} label={ORIGIN_LABELS[kind]} icon={null} />;
}

const FLEET_VALUE = '__fleet__';

export interface ShowingSelectProps {
  vessels: readonly ShowingVessel[];
  showing: Showing;
  onChange: (code: string | null) => void;
  disabled?: boolean;
  className?: string;
}

/** "Showing: Whole fleet (6 vessels) / DRAAK": what the counts and the order are for. */
export function ShowingSelect({ vessels, showing, onChange, disabled, className }: ShowingSelectProps) {
  const counted = vessels.filter((v) => v.counted && v.code);
  const uncounted = vessels.filter((v) => !v.counted && v.code);
  const value = showing.kind === 'fleet' ? FLEET_VALUE : (showing.vessel.code ?? FLEET_VALUE);
  const fleetLabel = `Whole fleet (${counted.length.toLocaleString('en-GB')} ${counted.length === 1 ? 'vessel' : 'vessels'})`;
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span id="forms-showing-label" className="type-caption shrink-0 text-muted-foreground">
        Showing
      </span>
      <Select value={value} onValueChange={(v) => onChange(v === FLEET_VALUE ? null : v)} disabled={disabled}>
        <SelectTrigger aria-labelledby="forms-showing-label" className={cn('h-9 w-full min-w-[10rem] max-w-[16rem]', COARSE)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FLEET_VALUE}>{fleetLabel}</SelectItem>
          {counted.length > 0 && (
            <SelectGroup>
              <SelectLabel>Vessels</SelectLabel>
              {counted.map((v) => (
                <SelectItem key={v.id} value={v.code as string}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {uncounted.length > 0 && (
            <SelectGroup>
              <SelectLabel>Not counted in fleet totals</SelectLabel>
              {uncounted.map((v) => (
                <SelectItem key={v.id} value={v.code as string}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The page's one freshness stamp and its Refresh (D-88). */
export function FreshnessActions({ updatedAt, refreshing, onRefresh }: { updatedAt: number | null; refreshing: boolean; onRefresh: () => void }) {
  return (
    <>
      {updatedAt ? (
        <span className="type-caption tabular-nums text-muted-foreground" data-testid="forms-updated">
          {formatUpdatedUtc(updatedAt)}
        </span>
      ) : null}
      <Button type="button" variant="outline" size="sm" className={COARSE} onClick={onRefresh} disabled={refreshing}>
        <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
        Refresh
      </Button>
    </>
  );
}

/** A plain notice line (D-01 states, hints). */
export function Notice({ children, className, testId }: { children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <p role="note" data-testid={testId} className={cn('flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 type-body-sm text-muted-foreground', className)}>
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export const AREAS_NOT_SET_UP =
  'Areas are not set up yet, so every template is listed under Unsorted. Hiding and ordering per vessel arrive with them.';

/** The in-scope "not found" of an unknown area or template, with the way back to the overview. */
export function FormsNotFound({ title, body }: { title: string; body: string }) {
  usePageLocationOverride({ title });
  return (
    <EmptyState
      kind="filtered"
      icon={SearchX}
      headingLevel={1}
      title={title}
      body={body}
      action={
        <Button asChild variant="outline" size="sm" className={COARSE}>
          <Link to={fleetFormsPath.index()}>All forms and checklists</Link>
        </Button>
      }
    />
  );
}
