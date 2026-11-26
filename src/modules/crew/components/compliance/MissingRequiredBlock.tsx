import React from 'react';
import { Plus, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/shared/components/status';
import type { MissingOnTab } from '@/modules/crew/lib/complianceModel';
import { STATE_ICON, stateTone } from './cellLook';

const COARSE = '[@media(pointer:coarse)]:h-11';

/**
 * "Missing required (n)" on a profile documents tab (gap/04 C24, W5 §5):
 * what the person's position needs on this tab and they do not hold (or
 * hold only expired), each with why ("Missing: nothing held counts for this
 * requirement.", "Nearest held: …") and + Add when the reader may add. The
 * same engine answers the compliance page and the add dialog's "Missing for
 * current role".
 */
export const MissingRequiredBlock: React.FC<{
  items: readonly MissingOnTab[];
  /** "Deckhand": whose requirements these are. */
  positionLabel: string | null;
  /** null: the reader may not add here (no button). */
  onAdd: ((item: MissingOnTab) => void) | null;
  /** The engine's answer failed: a line with Try again instead of the list. */
  error?: { retry: () => void } | null;
  /** Every requirement of the tab is held. */
  allHeld?: boolean;
}> = ({ items, positionLabel, onAdd, error, allHeld }) => {
  if (error) {
    return (
      <p className="flex flex-wrap items-center gap-2 type-caption text-muted-foreground" data-missing-required="error">
        What this position requires could not be checked.
        <Button type="button" variant="ghost" size="sm" onClick={error.retry} className={COARSE}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </p>
    );
  }
  if (items.length === 0) {
    return allHeld ? (
      <p className="type-caption text-muted-foreground" data-missing-required="0">
        Everything {positionLabel ? `a ${positionLabel}` : 'this position'} needs on this tab is held.
      </p>
    ) : null;
  }
  return (
    <Card className="min-w-0 border-dashed" data-missing-required={items.length}>
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
        <CardTitle className="type-subtitle flex flex-wrap items-baseline gap-x-2">
          Missing required ({items.length})
          {positionLabel ? <span className="type-caption font-normal text-muted-foreground">for a {positionLabel} on this vessel</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 p-4 pt-0 sm:p-6 sm:pt-0">
        <ul className="divide-y divide-border" aria-label="Missing required documents">
          {items.map((item) => {
            const Icon = STATE_ICON[item.state];
            return (
              <li key={item.rowId} className="flex min-w-0 flex-wrap items-start justify-between gap-2 py-2" data-missing-row={item.rowId}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words type-body font-medium text-foreground">{item.label}</span>
                    <StatusPill tone={stateTone(item.state)} icon={Icon}>
                      {item.state === 'expired' ? 'Expired' : 'Missing'}
                    </StatusPill>
                  </div>
                  <p className="type-caption text-muted-foreground">{item.sentence}</p>
                </div>
                {onAdd ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => onAdd(item)} aria-label={`Add ${item.label}`} className={COARSE}>
                    <Plus aria-hidden="true" />
                    Add
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};

/** An empty slot inside a category group ("Show empty slots"): a required document the person does not hold. */
export const EmptySlotRow: React.FC<{ item: MissingOnTab; onAdd: ((item: MissingOnTab) => void) | null }> = ({ item, onAdd }) => {
  const Icon = STATE_ICON[item.state];
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3" data-empty-slot={item.rowId}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="min-w-0 break-words type-body text-muted-foreground">{item.label}</span>
        <StatusPill tone={stateTone(item.state)} icon={Icon}>
          {item.state === 'expired' ? 'Expired' : 'Not held'}
        </StatusPill>
      </div>
      {onAdd ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onAdd(item)} aria-label={`Add ${item.label}`} className={COARSE}>
          <Plus aria-hidden="true" />
          Add
        </Button>
      ) : null}
    </li>
  );
};

export default MissingRequiredBlock;
