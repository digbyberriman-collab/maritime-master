import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notify } from '@/shared/lib/notify';
import {
  familiarisationRefusalMessage,
  personName,
  useStartFamiliarisation,
  type FamiliarisationMember,
  type FamiliarisationRecordDetail,
  type FamiliarisationTemplate,
} from '@/modules/crew/hooks/useFamiliarisation';

const COARSE = '[@media(pointer:coarse)]:h-11';

const startSchema = z.object({
  templateId: z.string().min(1, 'Pick the template to start'),
  profileId: z.string().min(1, 'Pick the crew member it is for'),
});
interface StartValues {
  templateId: string;
  profileId: string;
}

export interface StartFamiliarisationDialogProps {
  vessel: { id: string; companyId: string; name: string };
  /** The templates that apply on this vessel and are in use. */
  templates: readonly FamiliarisationTemplate[];
  members: readonly FamiliarisationMember[];
  /** Preselected template (a template row's Start). */
  templateId?: string | null;
  onOpenChange: (open: boolean) => void;
  onStarted?: (record: FamiliarisationRecordDetail) => void;
}

/**
 * Starts a familiarisation for one person on the vessel's crew (gap/04
 * C63): the chosen template's sections become the record's checklist, due
 * the template's number of days after they joined (or today, if later).
 * People in a position the template is required for get theirs opened
 * when they join; this is for everyone else, and for a second go.
 */
export const StartFamiliarisationDialog: React.FC<StartFamiliarisationDialogProps> = ({
  vessel,
  templates,
  members,
  templateId,
  onOpenChange,
  onStarted,
}) => {
  const start = useStartFamiliarisation({ id: vessel.id, companyId: vessel.companyId });
  const [rootError, setRootError] = React.useState<string | null>(null);
  const form = useForm<StartValues>({
    resolver: zodResolver(startSchema),
    defaultValues: { templateId: templateId ?? (templates.length === 1 ? templates[0].id : ''), profileId: '' },
  });
  const chosen = templates.find((t) => t.id === form.watch('templateId')) ?? null;
  const sortedMembers = React.useMemo(
    () => [...members].sort((a, b) => personName(a).localeCompare(personName(b))),
    [members],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setRootError(null);
    try {
      const record = await start.mutateAsync({ templateId: values.templateId, profileId: values.profileId });
      notify.success(`${record.templateName} is started for ${personName(record.person)}.`);
      onStarted?.(record);
      onOpenChange(false);
    } catch (error) {
      setRootError(familiarisationRefusalMessage(error));
    }
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-start-familiarisation="">
        <DialogHeader>
          <DialogTitle>Start familiarisation</DialogTitle>
          <DialogDescription>Opens the template's checklist for one person on {vessel.name}'s crew.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="min-w-0 space-y-4" noValidate>
            <FormField
              control={form.control}
              name="templateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className={COARSE}>
                        <SelectValue placeholder="Choose a template" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {chosen ? (
                    <FormDescription>
                      {chosen.itemCount} {chosen.itemCount === 1 ? 'item' : 'items'}
                      {chosen.dueWithinDays !== null ? `, due ${chosen.dueWithinDays === 0 ? 'on the day they join' : `within ${chosen.dueWithinDays} ${chosen.dueWithinDays === 1 ? 'day' : 'days'} of joining`}` : ''}.
                    </FormDescription>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="profileId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Crew member</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={sortedMembers.length === 0}>
                    <FormControl>
                      <SelectTrigger className={COARSE}>
                        <SelectValue placeholder={sortedMembers.length === 0 ? 'Nobody is on the crew' : 'Choose a crew member'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sortedMembers.map((m) => (
                        <SelectItem key={m.profileId} value={m.profileId}>
                          {personName(m)}
                          {m.positionName ? ` · ${m.positionName}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {rootError ? (
              <p className="type-body text-destructive" role="alert" data-start-error="">
                {rootError}
              </p>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className={COARSE} disabled={start.isPending}>
                {start.isPending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
                Start
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default StartFamiliarisationDialog;
