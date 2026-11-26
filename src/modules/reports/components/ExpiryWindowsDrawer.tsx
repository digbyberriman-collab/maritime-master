/**
 * "Alert windows" (gap/02 X2, R3, R4; DECISIONS C5, D-01, D-04, D-X5-02;
 * X5 spec X5-03B): how many days ahead each item type warns before it
 * expires, for the whole company. Opened from the fleet expiry reports by
 * readers with `fleet.operations.fleet_reports.admin`; the server gates the
 * same rule with fleet reach (`set_expiry_window_rule`).
 *
 * - One row per item type, the report's own types first: the window in
 *   force (the company's rule, else the default: passports 270 days,
 *   everything else 90), a days field (React Hook Form + zod,
 *   ../lib/expiryWindowSchema.ts) and Save; "Use the default" removes the rule.
 *   Windows set for single types (a course, a certificate type) are counted
 *   under their item type and keep applying.
 * - Writes only through `useSetExpiryWindowRule` / `useClearExpiryWindowRule`
 *   (the definers; the stored row is checked against what was asked, so no
 *   fake success). Refusals become sentences, as a toast and under the row.
 * - D-01: while `expiry_window_rules` is missing the defaults are shown
 *   read-only, with why; any other read error says so with Retry.
 *
 * 44 px targets on coarse pointers; the sheet fills a phone.
 */
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useCapability } from '@/lib/permissions/useCan';
import { cn } from '@/lib/utils';
import { AccessDenied, PageError, PageLoading } from '@/shared/components/states';
import { errorMessage } from '@/shared/lib/notify';
import {
  EXPIRY_ITEM_TYPES,
  EXPIRY_ITEM_TYPE_LABELS,
  FLEET_CAPS,
  expiryWindowFor,
  useClearExpiryWindowRule,
  useExpiryWindowRules,
  useSetExpiryWindowRule,
  type ExpiryItemType,
  type ExpiryWindowRuleView,
} from '@/modules/fleet';
import {
  EXPIRY_WINDOW_MAX_DAYS,
  expiryWindowFormDefaults,
  expiryWindowSchema,
  toSetWindowInput,
  toWarnDays,
  type ExpiryWindowFormValues,
} from '../lib/expiryWindowSchema';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

export interface ExpiryWindowsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** The item types of the report it was opened from, listed first. */
  focusTypes?: readonly ExpiryItemType[];
}

const days = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'day' : 'days'}`;

interface RowProps {
  itemType: ExpiryItemType;
  /** The item type's own rule, if any. */
  rule: ExpiryWindowRuleView | null;
  /** How many rules are set for single types under this item type. */
  typeRules: number;
  companyId: string | null;
  readOnly: boolean;
}

function WindowRow({ itemType, rule, typeRules, companyId, readOnly }: RowProps) {
  // No rule: the item type's default (passports 270 days, everything else 90).
  const current = rule ? rule.warn_days : expiryWindowFor([], { itemType });
  const form = useForm<ExpiryWindowFormValues>({ resolver: zodResolver(expiryWindowSchema), defaultValues: expiryWindowFormDefaults(current) });
  const setRule = useSetExpiryWindowRule(companyId);
  const clearRule = useClearExpiryWindowRule(companyId);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const id = React.useId();
  const fieldId = `${id}-days`;
  const errorId = `${id}-error`;
  const busy = setRule.isPending || clearRule.isPending;

  // A new window from the server (saved here, or by someone else) resets the field.
  const { reset } = form;
  React.useEffect(() => {
    reset(expiryWindowFormDefaults(current));
  }, [current, reset]);

  const onSubmit = form.handleSubmit(async (values) => {
    const warnDays = toWarnDays(values);
    if (warnDays === null) return;
    setRefusal(null);
    try {
      await setRule.mutateAsync(toSetWindowInput(itemType, warnDays));
    } catch (error) {
      setRefusal(errorMessage(error, 'The window was not saved.'));
    }
  });

  const onClear = async () => {
    if (!rule) return;
    setRefusal(null);
    try {
      await clearRule.mutateAsync(rule.id);
    } catch (error) {
      setRefusal(errorMessage(error, 'The window was not reset.'));
    }
  };

  const fieldError = form.formState.errors.warnDays?.message ?? null;
  const message = fieldError ?? refusal;
  const label = EXPIRY_ITEM_TYPE_LABELS[itemType];

  return (
    <li className="space-y-2 border-b border-border px-4 py-3 last:border-b-0">
      <form onSubmit={onSubmit} noValidate aria-label={`${label} warning window`} className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
            {label}
          </label>
          <p className="type-caption text-muted-foreground">
            {rule ? `Set to ${days(rule.warn_days)} for your company` : `Default: ${days(current)}`}
            {typeRules > 0 ? ` · ${typeRules} ${typeRules === 1 ? 'type has' : 'types have'} a window of ${typeRules === 1 ? 'its' : 'their'} own` : ''}
          </p>
          {rule ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className={cn('h-auto px-0 py-1 text-xs', COARSE)}
              disabled={readOnly || busy}
              onClick={onClear}
            >
              {clearRule.isPending ? 'Resetting…' : `Use the default (${days(expiryWindowFor([], { itemType }))})`}
            </Button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            id={fieldId}
            inputMode="numeric"
            autoComplete="off"
            className={cn('h-9 w-20 tabular-nums', COARSE)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={message ? errorId : undefined}
            disabled={readOnly || busy}
            {...form.register('warnDays')}
          />
          <span className="text-sm text-muted-foreground">days</span>
          <Button
            type="submit"
            size="sm"
            variant={form.formState.isDirty ? 'default' : 'outline'}
            className={COARSE}
            disabled={readOnly || busy || !form.formState.isDirty}
          >
            {setRule.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
      {message ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </li>
  );
}

function orderTypes(focus: readonly ExpiryItemType[]): { focus: ExpiryItemType[]; others: ExpiryItemType[] } {
  const inFocus = new Set(focus);
  return {
    focus: EXPIRY_ITEM_TYPES.filter((t) => inFocus.has(t)),
    others: EXPIRY_ITEM_TYPES.filter((t) => !inFocus.has(t)),
  };
}

function WindowList({ types, rows, companyId, readOnly, heading }: { types: readonly ExpiryItemType[]; rows: readonly ExpiryWindowRuleView[]; companyId: string | null; readOnly: boolean; heading: string }) {
  if (!types.length) return null;
  const headingId = `windows-${heading.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="px-4 pb-1 pt-4 type-caption text-muted-foreground">
        {heading}
      </h3>
      <ul>
        {types.map((type) => (
          <WindowRow
            key={type}
            itemType={type}
            rule={rows.find((r) => r.item_type === type && r.certificate_type_id === null) ?? null}
            typeRules={rows.filter((r) => r.item_type === type && r.certificate_type_id !== null).length}
            companyId={companyId}
            readOnly={readOnly}
          />
        ))}
      </ul>
    </section>
  );
}

function DrawerBody({ companyId, focusTypes }: { companyId: string | null; focusTypes: readonly ExpiryItemType[] }) {
  const access = useCapability(FLEET_CAPS.expiryWindowsAdmin);
  const windows = useExpiryWindowRules(companyId, { enabled: access.allowed });
  if (access.status === 'loading') return <PageLoading label="Checking your access" />;
  if (!access.allowed) {
    return <AccessDenied detail="Changing alert windows needs the fleet reports admin permission. Ask your account admin." />;
  }
  if (windows.state === 'error') return <PageError variant="inline" error={windows.error} title="The alert windows could not load" onRetry={windows.retry} />;
  if (windows.state === 'loading' || windows.state === 'idle') return <PageLoading label="Loading the alert windows" />;
  const readOnly = windows.state === 'not_set_up';
  const rows = windows.state === 'ready' ? windows.rows : [];
  const { focus, others } = orderTypes(focusTypes);
  return (
    <>
      {readOnly ? (
        <p role="note" className="mx-4 mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Alert windows can be changed once this part of STORM is set up. Until then the defaults apply: passports warn 270 days ahead, everything else 90.
        </p>
      ) : null}
      <WindowList heading="In this report" types={focus} rows={rows} companyId={companyId} readOnly={readOnly} />
      <WindowList heading={focus.length ? 'Other items' : 'Items'} types={others} rows={rows} companyId={companyId} readOnly={readOnly} />
    </>
  );
}

export function ExpiryWindowsDrawer({ open, onOpenChange, companyId, focusTypes = [] }: ExpiryWindowsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideClose className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" aria-describedby="expiry-windows-description">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <SheetTitle>Alert windows</SheetTitle>
            <SheetDescription id="expiry-windows-description">
              {`How many days ahead of its expiry date an item starts to show as due, up to ${EXPIRY_WINDOW_MAX_DAYS.toLocaleString('en-GB')}. The same windows apply on every vessel and on the dashboard.`}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className={cn('shrink-0', COARSE)} aria-label="Close alert windows">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">{open ? <DrawerBody companyId={companyId} focusTypes={focusTypes} /> : null}</div>
      </SheetContent>
    </Sheet>
  );
}

export default ExpiryWindowsDrawer;
