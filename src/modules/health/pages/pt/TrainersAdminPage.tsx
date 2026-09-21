import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { Fact, StaffOnlyNotice } from '@/modules/health/components/pt/PtCommon';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useHealthPeople } from '@/modules/health/hooks/useHealthPeople';
import {
  SENIORITIES,
  emptyPractitionerForm,
  usePractitionerMutations,
  usePractitionerQualifications,
  usePractitioners,
  type PractitionerEntry,
  type PractitionerFormData,
} from '@/modules/health/hooks/usePractitioners';
import { expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/health/lib/format';

/** The personal training roster, and the access that comes with it. */
const TrainersAdminPage: React.FC = () => {
  const access = useWellnessAccess();
  const canEdit = access.canAdmin;
  const trainers = usePractitioners('pt');
  const { createPractitioner, updatePractitioner, deletePractitioner, isMutating } =
    usePractitionerMutations();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PractitionerEntry | null>(null);
  const [deleting, setDeleting] = useState<PractitionerEntry | null>(null);

  const selected = useMemo(
    () => trainers.practitioners.find((t) => t.id === selectedId) ?? null,
    [trainers.practitioners, selectedId],
  );

  useEffect(() => {
    if (!selectedId && trainers.practitioners.length) setSelectedId(trainers.practitioners[0].id);
  }, [selectedId, trainers.practitioners]);

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={UserCog} title="Trainers" description="The personal training roster." />
        <StaffOnlyNotice what="page" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={UserCog}
        title="Trainers"
        description="Who may build and assign training programmes, and the certifications behind it."
        actions={
          canEdit ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add a trainer
            </Button>
          ) : undefined
        }
      />

      <Alert>
        <KeyRound className="h-4 w-4" />
        <AlertTitle>Linking a crew profile is what grants access</AlertTitle>
        <AlertDescription>
          A trainer listed here without a linked crew profile is a name on a list: they can be booked
          and credited, but they cannot sign in and edit anything. Linking their profile is what gives
          them wellness access across spa, nutrition, physiotherapy and training. Unlink it, or set
          them inactive, to take that access away.
        </AlertDescription>
      </Alert>

      {trainers.isLoading ? (
        <HealthLoading rows={3} />
      ) : trainers.isError ? (
        <HealthError error={trainers.error} title="Could not load the trainer roster" />
      ) : trainers.practitioners.length === 0 ? (
        <HealthEmpty
          icon={UserCog}
          title="No trainers on the roster"
          description={
            canEdit
              ? 'Add the trainer, then link their crew profile so they can sign in and build programmes.'
              : 'Ask a wellness administrator to add the training team.'
          }
          action={
            canEdit ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Add a trainer
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <ScrollArea className="max-h-[32rem] rounded-md border">
            <ul className="divide-y">
              {trainers.practitioners.map((trainer) => (
                <li key={trainer.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(trainer.id)}
                    className={cn(
                      'w-full px-3 py-3 text-left transition-colors hover:bg-accent/50',
                      trainer.id === selectedId && 'bg-accent',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {trainer.full_name}
                      </span>
                      {trainer.profile_id ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-success/20 bg-success/10 text-[10px] text-success"
                        >
                          Has access
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          No login
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[trainer.role_title, trainer.vessel_name, trainer.is_active ? null : 'Inactive']
                        .filter(Boolean)
                        .join(' · ') || 'Personal trainer'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>

          <div className="space-y-4">
            {selected && (
              <>
                <Card>
                  <CardHeader className="gap-3 pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{selected.full_name}</CardTitle>
                        <CardDescription>
                          {selected.role_title ?? 'Personal trainer'}
                          {selected.bio ? ` · ${selected.bio}` : ''}
                        </CardDescription>
                      </div>
                      {canEdit && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(selected);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={isMutating}
                            onClick={() => setDeleting(selected)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Fact
                      label="Wellness access"
                      value={selected.profile_id ? 'Granted by linked profile' : 'No login linked'}
                    />
                    <Fact label="Seniority" value={selected.seniority ?? '—'} />
                    <Fact label="Vessel" value={selected.vessel_name ?? 'Fleet'} />
                    <Fact label="Status" value={selected.is_active ? 'Active' : 'Inactive'} />
                    <Fact label="Email" value={selected.email ?? '—'} />
                    <Fact label="Phone" value={selected.phone ?? '—'} />
                    <Fact label="Started" value={formatDate(selected.started_on)} />
                    <Fact label="Ended" value={selected.ended_on ? formatDate(selected.ended_on) : '—'} />
                    {selected.license_number && (
                      <Fact
                        label="Licence"
                        value={`${selected.license_number}${
                          selected.license_authority ? ` · ${selected.license_authority}` : ''
                        }`}
                        className="col-span-2"
                      />
                    )}
                    {selected.license_expiry && (
                      <Fact label="Licence expires" value={formatDate(selected.license_expiry)} />
                    )}
                  </CardContent>
                </Card>

                <QualificationsCard practitionerId={selected.id} canEdit={canEdit} />
              </>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.full_name} from the roster?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose wellness access immediately and their certifications go with them. The
              programmes and sessions they wrote are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) deletePractitioner.mutate(deleting.id, { onSuccess: () => setSelectedId(null) });
                setDeleting(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TrainerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        trainer={editing}
        saving={isMutating}
        onSave={(values) => {
          if (editing) {
            updatePractitioner.mutate({ id: editing.id, values }, { onSuccess: () => setFormOpen(false) });
          } else {
            createPractitioner.mutate(values, {
              onSuccess: (row) => {
                setSelectedId(row.id);
                setFormOpen(false);
              },
            });
          }
        }}
      />
    </div>
  );
};

interface QualificationsCardProps {
  practitionerId: string;
  canEdit: boolean;
}

const QualificationsCard: React.FC<QualificationsCardProps> = ({ practitionerId, canEdit }) => {
  const quals = usePractitionerQualifications(practitionerId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', issuing_authority: '', issue_date: '', expiry_date: '', category: 'fitness' });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Certifications</CardTitle>
          <CardDescription>
            Keep first aid and coaching certificates current. Expiries appear on the health dashboard.
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {quals.isLoading ? (
          <HealthLoading rows={2} />
        ) : quals.isError ? (
          <HealthError error={quals.error} title="Could not load certifications" />
        ) : quals.qualifications.length === 0 ? (
          <HealthEmpty
            icon={ShieldCheck}
            title="No certifications recorded"
            description="Add the coaching and first aid certificates this trainer holds, with their expiry dates."
            className="border-0 p-6"
            action={
              canEdit ? (
                <Button size="sm" onClick={() => setOpen(true)}>
                  Add a certification
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y">
            {quals.qualifications.map((qual) => (
              <li key={qual.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{qual.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[qual.issuing_authority, qual.issue_date ? `issued ${formatDate(qual.issue_date)}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'No issuer recorded'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {qual.expiry_date && (
                    <Badge variant="outline" className={cn('text-[10px]', toneClass[expiryTone(qual.expiry_date)])}>
                      {expiryLabel(qual.expiry_date)}
                    </Badge>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label={`Remove ${qual.name}`}
                      onClick={() => quals.deleteQualification.mutate(qual.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a certification</DialogTitle>
            <DialogDescription>Record what it is, who issued it and when it runs out.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.name.trim()) return;
              quals.saveQualification.mutate(
                {
                  name: form.name.trim(),
                  category: form.category,
                  issuing_authority: form.issuing_authority.trim() || null,
                  issue_date: form.issue_date || null,
                  expiry_date: form.expiry_date || null,
                },
                {
                  onSuccess: () => {
                    setForm({
                      name: '',
                      issuing_authority: '',
                      issue_date: '',
                      expiry_date: '',
                      category: 'fitness',
                    });
                    setOpen(false);
                  },
                },
              );
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="qual-name">Certification</Label>
              <Input
                id="qual-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Level 3 Personal Trainer"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qual-issuer">Issued by</Label>
              <Input
                id="qual-issuer"
                value={form.issuing_authority}
                onChange={(e) => setForm((prev) => ({ ...prev, issuing_authority: e.target.value }))}
                placeholder="CIMSPA"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="qual-issued">Issued on</Label>
                <Input
                  id="qual-issued"
                  type="date"
                  value={form.issue_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, issue_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qual-expiry">Expires</Label>
                <Input
                  id="qual-expiry"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, expiry_date: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={quals.isMutating}>
                {quals.isMutating ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

interface TrainerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainer: PractitionerEntry | null;
  onSave: (values: PractitionerFormData) => void;
  saving: boolean;
}

const TrainerFormDialog: React.FC<TrainerFormDialogProps> = ({
  open,
  onOpenChange,
  trainer,
  onSave,
  saving,
}) => {
  const directory = useHealthPeople();
  const [form, setForm] = useState<PractitionerFormData>(emptyPractitionerForm('pt'));

  useEffect(() => {
    if (!open) return;
    setForm(
      trainer
        ? {
            profile_id: trainer.profile_id,
            discipline: 'pt',
            full_name: trainer.full_name,
            role_title: trainer.role_title,
            seniority: trainer.seniority,
            rank_code: trainer.rank_code,
            vessel_id: trainer.vessel_id,
            email: trainer.email,
            phone: trainer.phone,
            specialisms: trainer.specialisms ?? [],
            bio: trainer.bio,
            license_number: trainer.license_number,
            license_authority: trainer.license_authority,
            license_expiry: trainer.license_expiry,
            started_on: trainer.started_on,
            ended_on: trainer.ended_on,
            is_active: trainer.is_active,
            notes: trainer.notes,
          }
        : emptyPractitionerForm('pt'),
    );
  }, [open, trainer]);

  const crew = useMemo(() => directory.entries.filter((p) => p.profile_id), [directory.entries]);

  const set = <K extends keyof PractitionerFormData>(key: K, value: PractitionerFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{trainer ? 'Edit trainer' : 'Add a trainer'}</DialogTitle>
          <DialogDescription>
            Linking a crew profile is what gives this person wellness access. Leave it unlinked for a
            visiting trainer who should not sign in.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!form.full_name.trim()) return;
            onSave(form);
          }}
        >
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="trainer-name">Full name</Label>
                <Input
                  id="trainer-name"
                  value={form.full_name}
                  onChange={(e) => set('full_name', e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Linked crew profile</Label>
                <Select
                  value={form.profile_id ?? 'none'}
                  onValueChange={(value) => set('profile_id', value === 'none' ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked, no sign in</SelectItem>
                    {crew.map((person) => (
                      <SelectItem key={person.id} value={person.profile_id as string}>
                        {person.displayName}
                        {person.rank ? ` · ${person.rank}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Linking grants wellness access at once. It cannot be granted any other way from this
                  page.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="trainer-role">Role title</Label>
                  <Input
                    id="trainer-role"
                    value={form.role_title ?? ''}
                    onChange={(e) => set('role_title', e.target.value)}
                    placeholder="Head of fitness"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Seniority</Label>
                  <Select
                    value={form.seniority ?? 'practitioner'}
                    onValueChange={(value) => set('seniority', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SENIORITIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trainer-email">Email</Label>
                  <Input
                    id="trainer-email"
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => set('email', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trainer-phone">Phone</Label>
                  <Input
                    id="trainer-phone"
                    value={form.phone ?? ''}
                    onChange={(e) => set('phone', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trainer-licence">Licence number</Label>
                  <Input
                    id="trainer-licence"
                    value={form.license_number ?? ''}
                    onChange={(e) => set('license_number', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trainer-authority">Licence authority</Label>
                  <Input
                    id="trainer-authority"
                    value={form.license_authority ?? ''}
                    onChange={(e) => set('license_authority', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trainer-expiry">Licence expires</Label>
                  <Input
                    id="trainer-expiry"
                    type="date"
                    value={form.license_expiry ?? ''}
                    onChange={(e) => set('license_expiry', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trainer-started">Started</Label>
                  <Input
                    id="trainer-started"
                    type="date"
                    value={form.started_on ?? ''}
                    onChange={(e) => set('started_on', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trainer-bio">Biography</Label>
                <Textarea
                  id="trainer-bio"
                  rows={2}
                  value={form.bio ?? ''}
                  onChange={(e) => set('bio', e.target.value)}
                  placeholder="Strength and conditioning, dive fitness, rehabilitation support"
                />
              </div>

              <div className="flex items-center gap-3 rounded-md border border-border p-3">
                <Switch
                  id="trainer-active"
                  checked={form.is_active}
                  onCheckedChange={(value) => set('is_active', value)}
                />
                <Label htmlFor="trainer-active" className="cursor-pointer">
                  Active. Turning this off removes their wellness access.
                </Label>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.full_name.trim()}>
              {saving ? 'Saving...' : 'Save trainer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TrainersAdminPage;
