import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { humanise } from '@/modules/hris/lib/format';
import {
  CONTRACT_TYPES,
  CURRENCY_PRESETS,
  OTHER_CURRENCY,
  WAGE_FREQUENCIES,
  contractFormSchema,
  contractToFormValues,
  emptyContractFormValues,
  type ContractFormValues,
  type CrewContractRow,
} from '@/modules/hris/lib/contractHelpers';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';

const NO_VESSEL = '__none__';

interface ContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this contract; otherwise it creates one. */
  contract?: CrewContractRow | null;
  /** Prefill for new contracts (vessel, rank, position from the crew directory). */
  defaults?: Partial<ContractFormValues>;
  vessels: CompanyVessel[];
  crewName?: string;
  onSubmit: (values: ContractFormValues) => Promise<void>;
  isPending?: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </div>
);

/**
 * Create / edit an employment contract. Money is entered in major units and
 * converted to minor units by `formValuesToPayload` at submit time.
 */
export const ContractFormDialog: React.FC<ContractFormDialogProps> = ({
  open,
  onOpenChange,
  contract,
  defaults,
  vessels,
  crewName,
  onSubmit,
  isPending,
}) => {
  const isEdit = Boolean(contract);
  const statusEditable = !contract || contract.status === 'draft' || contract.status === 'active';

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: contract ? contractToFormValues(contract) : emptyContractFormValues(defaults),
  });

  useEffect(() => {
    if (open) form.reset(contract ? contractToFormValues(contract) : emptyContractFormValues(defaults));
    // Re-seed only when the dialog opens or the target contract changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract?.id]);

  const currency = form.watch('wage_currency');

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit contract' : 'New contract'}</DialogTitle>
          <DialogDescription>
            {crewName ? `Employment contract for ${crewName}. ` : ''}
            Activating a contract supersedes any other active contract for this crew member.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="space-y-6">
            <Section title="Contract">
              <FormField
                control={form.control}
                name="contract_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contract type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CONTRACT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{humanise(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {statusEditable && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="contract_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contract number</FormLabel>
                    <FormControl><Input placeholder="e.g. SEA-2026-014" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vessel_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vessel</FormLabel>
                    <Select value={field.value || NO_VESSEL} onValueChange={(v) => field.onChange(v === NO_VESSEL ? '' : v)}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_VESSEL}>Unassigned</SelectItem>
                        {vessels.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rank"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rank</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl><Input placeholder="Deck, Engine, Interior…" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Dates">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormDescription>Leave blank for open-ended.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="probation_end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Probation ends</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notice_period_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notice period (days)</FormLabel>
                    <FormControl><Input inputMode="numeric" placeholder="30" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Terms">
              <FormField
                control={form.control}
                name="rotation_pattern"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rotation pattern</FormLabel>
                    <FormControl><Input placeholder="e.g. 2:2, 10:2, seasonal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sea_reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SEA reference</FormLabel>
                    <FormControl><Input placeholder="Seafarer Employment Agreement ref." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="flag_state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Flag state</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="governing_law"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Governing law</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section title="Remuneration">
              <FormField
                control={form.control}
                name="base_wage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base wage</FormLabel>
                    <FormControl><Input inputMode="decimal" placeholder="0.00" {...field} /></FormControl>
                    <FormDescription>Entered in major units; stored as minor units.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wage_frequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select value={field.value || 'monthly'} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WAGE_FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>{humanise(f)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="wage_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select value={field.value || 'EUR'} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCY_PRESETS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                        <SelectItem value={OTHER_CURRENCY}>Other…</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {currency === OTHER_CURRENCY && (
                <FormField
                  control={form.control}
                  name="wage_currency_other"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency code</FormLabel>
                      <FormControl><Input placeholder="ISO 4217, e.g. NOK" maxLength={3} className="uppercase" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </Section>

            <Section title="Signatures">
              <FormField
                control={form.control}
                name="signed_by_crew_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Signed by crew on</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="signed_by_company_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Signed by company on</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save changes' : 'Create contract'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ContractFormDialog;
