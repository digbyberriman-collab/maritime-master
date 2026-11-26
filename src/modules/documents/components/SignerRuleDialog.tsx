/**
 * Choose who can sign a vessel's fleet documents (gap/02 FD8, W1 "Choose
 * who can sign"; X5 spec X5-05B): the vessel's Master (or a fleet document
 * admin) sets the rule for every document type, or for one type:
 *
 * - every document type: the default (everyone on the crew with an app
 *   login; no rule stored), heads of department and above, chosen
 *   positions, or chosen people;
 * - one type: the same as every document type (its own rule removed),
 *   everyone with a login, heads of department and above, chosen
 *   positions or chosen people.
 *
 * Positions come from the crew list the caller reads, and one can be typed
 * (the server matches office names, so "Chief Officer" also matches "chief
 * officer"); people come from the same list. Anyone outside the rule is
 * shown as "Not on the signer list": they cannot acknowledge, and cannot
 * be recorded as witnessed, until the rule includes them.
 *
 * Saved through `fleet_document_set_signer_rule` (a NULL rule removes it);
 * the returned rule is checked against the vessel, type, rule and lists
 * before it says so; a refusal stays in the dialog as a sentence.
 */
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, UserCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { errorMessage, notify } from '@/shared/lib/notify';
import { SIGNER_RULE_HINTS, SIGNER_RULE_LABELS, effectiveSignerRule, signerRuleSummary } from '../lib/ackAdmin';
import {
  ALL_TYPES,
  DEFAULT_RULE,
  POSITION_MAX,
  cleanPositions,
  signerRuleSchema,
  toSignerRuleArgs,
  type SignerRuleChoice,
  type SignerRuleFormValues,
} from '../lib/acknowledgementSchema';
import { useSetVesselSignerRule, type VesselSignerRule } from '../hooks/useFleetDocumentAcks';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

export interface SignerPerson {
  profileId: string;
  name: string;
  position: string | null;
}

export interface SignerRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  vesselId: string;
  vesselName: string;
  /** The vessel's document types (of the documents published to it). */
  types: readonly { id: string; name: string }[];
  /** The vessel's stored rules. */
  rules: readonly VesselSignerRule[];
  /** Positions on the crew list the caller reads. */
  positions: readonly string[];
  /** People on the crew list the caller reads. */
  people: readonly SignerPerson[];
}

export function SignerRuleDialog(props: SignerRuleDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto sm:w-full" aria-describedby="signer-rule-description">
        {open ? <SignerRuleForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** The form's values for a scope, from its stored rule (none: the default / same as every type). */
function valuesFor(rules: readonly VesselSignerRule[], typeId: string): SignerRuleFormValues {
  const rule = rules.find((r) => (typeId === ALL_TYPES ? r.type_id === null : r.type_id === typeId)) ?? null;
  return {
    typeId,
    rule: rule ? rule.rule : DEFAULT_RULE,
    positions: rule?.rule === 'positions' ? [...rule.positions] : [],
    profileIds: rule?.rule === 'named_people' ? [...rule.profile_ids] : [],
  };
}

function SignerRuleForm({ onOpenChange, companyId, vesselId, vesselName, types, rules, positions, people }: SignerRuleDialogProps) {
  const id = React.useId();
  const save = useSetVesselSignerRule(companyId);
  const form = useForm<SignerRuleFormValues>({ resolver: zodResolver(signerRuleSchema), defaultValues: valuesFor(rules, ALL_TYPES) });
  const typeId = form.watch('typeId');
  const rule = form.watch('rule');
  const chosenPositions = form.watch('positions');
  const chosenPeople = form.watch('profileIds');
  const [newPosition, setNewPosition] = React.useState('');
  const [query, setQuery] = React.useState('');
  const busy = save.isPending;

  const typeName = (tid: string) => types.find((t) => t.id === tid)?.name ?? 'This document type';
  const allTypesRule = rules.find((r) => r.type_id === null) ?? null;
  const nameOf = (profileId: string) => people.find((p) => p.profileId === profileId)?.name ?? null;
  const ownRuleTypes = new Set(rules.filter((r) => r.type_id !== null).map((r) => r.type_id as string));

  const choices: { value: SignerRuleChoice; label: string; hint: string }[] = [
    typeId === ALL_TYPES
      ? { value: DEFAULT_RULE, label: `${SIGNER_RULE_LABELS.all_crew_with_login} (default)`, hint: SIGNER_RULE_HINTS.all_crew_with_login }
      : { value: DEFAULT_RULE, label: 'The same as every document type', hint: signerRuleSummary(allTypesRule, nameOf) },
    ...(typeId === ALL_TYPES ? [] : [{ value: 'all_crew_with_login' as const, label: SIGNER_RULE_LABELS.all_crew_with_login, hint: 'Overrides a stricter rule for every type.' }]),
    { value: 'hod_and_above', label: SIGNER_RULE_LABELS.hod_and_above, hint: SIGNER_RULE_HINTS.hod_and_above },
    { value: 'positions', label: SIGNER_RULE_LABELS.positions, hint: SIGNER_RULE_HINTS.positions },
    { value: 'named_people', label: SIGNER_RULE_LABELS.named_people, hint: SIGNER_RULE_HINTS.named_people },
  ];

  const positionOptions = cleanPositions([...positions, ...chosenPositions]).sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' }));
  const visiblePeople = people.filter((p) => !query.trim() || `${p.name} ${p.position ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (field: 'positions' | 'profileIds', value: string, on: boolean) => {
    const current = form.getValues(field);
    const next = on ? [...current, value] : current.filter((v) => v.toLowerCase() !== value.toLowerCase());
    form.setValue(field, next, { shouldValidate: form.formState.isSubmitted });
  };
  const addPosition = () => {
    const p = newPosition.trim();
    if (!p || p.length > POSITION_MAX) return;
    if (!chosenPositions.some((c) => c.toLowerCase() === p.toLowerCase())) toggle('positions', p, true);
    setNewPosition('');
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync(toSignerRuleArgs(values, vesselId));
      const scope = values.typeId === ALL_TYPES ? 'every document type' : typeName(values.typeId);
      notify.success('Who can sign is saved', {
        description:
          saved.kind === 'default'
            ? values.typeId === ALL_TYPES
              ? `${vesselName}: everyone on the crew with an app login signs (the default).`
              : `${vesselName}, ${scope}: the same as every document type.`
            : `${vesselName}, ${scope}: ${signerRuleSummary(saved.rule, nameOf)}.`,
      });
      onOpenChange(false);
    } catch {
      // Shown below, in words.
    }
  });

  const error = (field: 'positions' | 'profileIds') => form.formState.errors[field]?.message ?? null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Choose who can sign</DialogTitle>
        <DialogDescription id="signer-rule-description">
          {`Who on ${vesselName} acknowledges fleet documents. People outside the rule are shown as not on the signer list: they cannot acknowledge, or be recorded as witnessed, until it includes them.`}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-type`}>Applies to</Label>
        <Controller
          control={form.control}
          name="typeId"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(v) => {
                form.reset(valuesFor(rules, v));
                setNewPosition('');
                setQuery('');
              }}
              disabled={busy}
            >
              <SelectTrigger id={`${id}-type`} className={COARSE}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>Every document type</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {ownRuleTypes.has(t.id) ? `${t.name} (own rule)` : t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Who signs</legend>
        <Controller
          control={form.control}
          name="rule"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={(v) => field.onChange(v)} className="gap-1" disabled={busy}>
              {choices.map((c) => (
                <Label
                  key={c.value}
                  htmlFor={`${id}-rule-${c.value}`}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm font-normal',
                    COARSE,
                    field.value === c.value && 'border-primary bg-signal-muted',
                  )}
                >
                  <RadioGroupItem id={`${id}-rule-${c.value}`} value={c.value} className="mt-0.5" />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block break-words text-foreground">{c.label}</span>
                    <span className="type-caption block break-words text-muted-foreground">{c.hint}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          )}
        />
      </fieldset>

      {rule === 'positions' ? (
        <fieldset className="space-y-2" aria-describedby={error('positions') ? `${id}-positions-error` : undefined}>
          <legend className="text-sm font-medium text-foreground">Positions that sign</legend>
          {positionOptions.length ? (
            <ul className="grid gap-1 sm:grid-cols-2">
              {positionOptions.map((p) => {
                const checked = chosenPositions.some((c) => c.toLowerCase() === p.toLowerCase());
                return (
                  <li key={p}>
                    <Label className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal hover:bg-accent', COARSE)}>
                      <Checkbox checked={checked} onCheckedChange={(v) => toggle('positions', p, v === true)} disabled={busy} />
                      <span className="min-w-0 break-words text-foreground">{p}</span>
                    </Label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="type-caption text-muted-foreground">No positions on the crew list yet. Type one below.</p>
          )}
          <div className="flex gap-2">
            <Input
              aria-label="Add a position"
              placeholder="Add a position, for example Bosun"
              value={newPosition}
              maxLength={POSITION_MAX}
              onChange={(e) => setNewPosition(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPosition();
                }
              }}
              className={COARSE}
              disabled={busy}
            />
            <Button type="button" variant="outline" className={COARSE} onClick={addPosition} disabled={busy || !newPosition.trim()}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add
            </Button>
          </div>
          {error('positions') ? (
            <p id={`${id}-positions-error`} role="alert" className="text-sm text-destructive">
              {error('positions')}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {rule === 'named_people' ? (
        <fieldset className="space-y-2" aria-describedby={error('profileIds') ? `${id}-people-error` : undefined}>
          <legend className="text-sm font-medium text-foreground">{`People who sign (${chosenPeople.length.toLocaleString('en-GB')} chosen)`}</legend>
          {people.length > 8 ? (
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Find a person" placeholder="Find a person" value={query} onChange={(e) => setQuery(e.target.value)} className={cn('pl-8', COARSE)} />
            </div>
          ) : null}
          {people.length ? (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {visiblePeople.map((p) => (
                <li key={p.profileId}>
                  <Label className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal hover:bg-accent', COARSE)}>
                    <Checkbox
                      checked={chosenPeople.includes(p.profileId)}
                      onCheckedChange={(v) => toggle('profileIds', p.profileId, v === true)}
                      disabled={busy}
                    />
                    <span className="min-w-0 break-words text-foreground">{p.name}</span>
                    {p.position ? <span className="type-caption ml-auto shrink-0 text-muted-foreground">{p.position}</span> : null}
                  </Label>
                </li>
              ))}
              {visiblePeople.length === 0 ? <li className="px-2 py-1.5 text-sm text-muted-foreground">Nobody matches.</li> : null}
            </ul>
          ) : (
            <p className="type-caption text-muted-foreground">
              Nobody is on the crew list for this vessel’s documents yet. Publish a document to the vessel first, or choose another rule.
            </p>
          )}
          {error('profileIds') ? (
            <p id={`${id}-people-error`} role="alert" className="text-sm text-destructive">
              {error('profileIds')}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {save.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Who can sign was not saved</AlertTitle>
          <AlertDescription>{errorMessage(save.error, 'Try again.')}</AlertDescription>
        </Alert>
      ) : null}

      <p className="type-caption text-muted-foreground">
        {`Now: ${signerRuleSummary(typeId === ALL_TYPES ? allTypesRule : effectiveSignerRule(rules, typeId), nameOf)}.`}
      </p>

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" className={COARSE} disabled={busy} aria-busy={busy}>
          <UserCheck aria-hidden="true" className="h-4 w-4" />
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default SignerRuleDialog;
