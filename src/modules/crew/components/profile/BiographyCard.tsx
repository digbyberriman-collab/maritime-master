import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, NotebookPen, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { notify } from '@/shared/lib/notify';
import { BIOGRAPHY_MAX, biographySchema, profileSaveRefusal, type BiographyValues } from '@/modules/crew/lib/personalDetailsSchema';

interface BiographyCardProps {
  biography: string | null;
  /** The viewer may change it (the person, or an editor). */
  canEdit: boolean;
  /** Saving is not available yet (D-01); the reason is shown instead of Edit. */
  unavailableReason?: string | null;
  saving: boolean;
  onSave: (biography: string | null) => Promise<unknown>;
}

const count = (n: number) => n.toLocaleString('en-GB');

/**
 * Biography (gap/04 C21): a short professional summary, up to 2,000
 * characters, edited in place with Cancel and Save. It feeds the crew
 * biographies report once that report's audience is decided (D-X1-15).
 */
export const BiographyCard: React.FC<BiographyCardProps> = ({ biography, canEdit, unavailableReason, saving, onSave }) => {
  const [editing, setEditing] = useState(false);
  const form = useForm<BiographyValues>({ resolver: zodResolver(biographySchema), defaultValues: { biography: biography ?? '' } });
  const length = form.watch('biography')?.length ?? 0;

  const start = () => {
    form.reset({ biography: biography ?? '' });
    setEditing(true);
  };
  const submit = form.handleSubmit(async (values) => {
    const next = values.biography.trim() ? values.biography.trim() : null;
    if (next === (biography ?? null)) {
      setEditing(false);
      return;
    }
    try {
      await onSave(next);
      notify.success('Biography saved');
      setEditing(false);
    } catch (error) {
      const refusal = profileSaveRefusal(error);
      if (refusal.field === 'biography') form.setError('biography', { message: refusal.message });
      else notify.error(refusal.message, { title: 'The biography was not saved' });
    }
  });

  return (
    <Card data-profile-card="biography">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <NotebookPen aria-hidden="true" className="size-4 text-muted-foreground" />
          <CardTitle className="type-subtitle">Biography</CardTitle>
        </div>
        {canEdit && !editing && !unavailableReason ? (
          <Button type="button" variant="ghost" size="sm" onClick={start} aria-label="Edit biography" className="[@media(pointer:coarse)]:h-11">
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <Form {...form}>
            <form onSubmit={submit} className="space-y-3">
              <FormField
                control={form.control}
                name="biography"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Biography</FormLabel>
                    <FormControl>
                      <Textarea rows={8} maxLength={BIOGRAPHY_MAX + 200} placeholder="Experience, qualifications and what they bring to the vessel." {...field} />
                    </FormControl>
                    <div className="flex items-start justify-between gap-2">
                      <FormMessage />
                      <span className={length > BIOGRAPHY_MAX ? 'ml-auto type-caption text-critical' : 'ml-auto type-caption text-muted-foreground'}>
                        {count(length)} / {count(BIOGRAPHY_MAX)}
                      </span>
                    </div>
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </form>
          </Form>
        ) : biography ? (
          <p className="whitespace-pre-wrap break-words type-body text-foreground">{biography}</p>
        ) : (
          <p className="type-body text-muted-foreground">No biography yet.</p>
        )}
        {unavailableReason && !editing ? <p className="mt-2 type-caption text-muted-foreground">{unavailableReason}</p> : null}
      </CardContent>
    </Card>
  );
};

export default BiographyCard;
