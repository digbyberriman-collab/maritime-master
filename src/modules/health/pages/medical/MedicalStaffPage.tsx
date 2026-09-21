import React, { useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
  UserCog,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import {
  emptyPractitionerForm,
  SENIORITIES,
  usePractitionerMutations,
  usePractitionerQualifications,
  usePractitioners,
  type PractitionerEntry,
  type PractitionerFormData,
} from '@/modules/health/hooks/usePractitioners';
import { expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/health/lib/format';

/**
 * The medical staff roster. This page is also the access control surface for
 * the section: linking a crew profile here is what gives a ship's medic
 * clinical rights, so the consequence is stated in the form rather than
 * hidden in a permissions screen.
 */
const MedicalStaffPage: React.FC = () => {
  const access = useMedicalAccess();
  const roster = usePractitioners('medical');
  const { createPractitioner, updatePractitioner, deletePractitioner, isMutating } =
    usePractitionerMutations();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PractitionerEntry | null>(null);
  const [deleting, setDeleting] = useState<PractitionerEntry | null>(null);
  const [qualificationsFor, setQualificationsFor] = useState<PractitionerEntry | null>(null);

  const active = useMemo(() => roster.practitioners.filter((p) => p.is_active), [roster.practitioners]);
  const former = useMemo(() => roster.practitioners.filter((p) => !p.is_active), [roster.practitioners]);
  const unlinked = useMemo(() => active.filter((p) => !p.profile_id), [active]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (entry: PractitionerEntry) => {
    setEditing(entry);
    setFormOpen(true);
  };

  const submit = async (values: PractitionerFormData) => {
    if (editing) await updatePractitioner.mutateAsync({ id: editing.id, values });
    else await createPractitioner.mutateAsync(values);
  };

  let body: React.ReactNode;
  if (roster.isError) {
    body = <HealthError error={roster.error} title="Could not load the medical staff roster" />;
  } else if (roster.isLoading) {
    body = <HealthLoading rows={3} />;
  } else if (roster.practitioners.length === 0) {
    body = (
      <HealthEmpty
        icon={Stethoscope}
        title="No medical staff on the roster"
        description="Add the ship's medic, nurse or doctor. Linking their crew profile is what gives them access to clinical records."
        action={
          access.canAdmin ? (
            <Button onClick={openCreate} className="gap-1">
              <Plus className="h-4 w-4" /> Add medical staff
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <div className="space-y-6">
        {unlinked.length > 0 && access.canAdmin && (
          <Alert>
            <UserCog className="h-4 w-4" />
            <AlertTitle>
              {unlinked.length} {unlinked.length === 1 ? 'person has' : 'people have'} no crew
              profile linked
            </AlertTitle>
            <AlertDescription>
              They appear on the roster but cannot open clinical records. Edit them and choose their
              crew profile to grant access.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {active.map((entry) => (
            <StaffCard
              key={entry.id}
              entry={entry}
              canEdit={access.canAdmin}
              onEdit={openEdit}
              onDelete={setDeleting}
              onQualifications={setQualificationsFor}
            />
          ))}
        </div>

        {former.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              No longer on the roster
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {former.map((entry) => (
                <StaffCard
                  key={entry.id}
                  entry={entry}
                  canEdit={access.canAdmin}
                  onEdit={openEdit}
                  onDelete={setDeleting}
                  onQualifications={setQualificationsFor}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Stethoscope}
        scope="medical"
        title="Medical staff"
        description="Who is qualified to treat on board, what they hold and when it expires."
        actions={
          access.canAdmin && (
            <Button onClick={openCreate} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Add medical staff
            </Button>
          )
        }
      />

      {body}

      <PractitionerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        entry={editing}
        onSubmit={submit}
        busy={isMutating}
      />

      <QualificationsDialog
        entry={qualificationsFor}
        onOpenChange={(open) => !open && setQualificationsFor(null)}
        canEdit={access.canAdmin}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.full_name} from the roster?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose clinical access immediately. Their qualifications are removed with them.
              Records they wrote are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) deletePractitioner.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface StaffCardProps {
  entry: PractitionerEntry;
  canEdit: boolean;
  onEdit: (entry: PractitionerEntry) => void;
  onDelete: (entry: PractitionerEntry) => void;
  onQualifications: (entry: PractitionerEntry) => void;
}

const StaffCard: React.FC<StaffCardProps> = ({
  entry,
  canEdit,
  onEdit,
  onDelete,
  onQualifications,
}) => (
  <Card className={cn(!entry.is_active && 'opacity-70')}>
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="truncate">{entry.full_name}</span>
            {entry.profile_id ? (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <BadgeCheck className="h-3 w-3" /> Has access
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                No login linked
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="truncate">
            {[entry.role_title, entry.rank_code, entry.vessel_name].filter(Boolean).join(' · ') ||
              'No role recorded'}
          </CardDescription>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" onClick={() => onEdit(entry)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(entry)} aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">
      {entry.specialisms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.specialisms.map((s) => (
            <Badge key={s} variant="secondary" className="text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Licence</dt>
        <dd className="text-foreground">{entry.license_number || '—'}</dd>
        <dt className="text-muted-foreground">Authority</dt>
        <dd className="text-foreground">{entry.license_authority || '—'}</dd>
        <dt className="text-muted-foreground">Licence expires</dt>
        <dd>
          {entry.license_expiry ? (
            <Badge variant="outline" className={cn('text-[10px]', toneClass[expiryTone(entry.license_expiry)])}>
              {expiryLabel(entry.license_expiry)}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </dd>
        <dt className="text-muted-foreground">On roster</dt>
        <dd className="text-foreground">
          {formatDate(entry.started_on)}
          {entry.ended_on ? ` to ${formatDate(entry.ended_on)}` : ''}
        </dd>
      </dl>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {entry.qualificationCount} {entry.qualificationCount === 1 ? 'qualification' : 'qualifications'}
          {entry.expiringQualifications > 0 && (
            <span className="text-warning"> · {entry.expiringQualifications} expiring</span>
          )}
        </span>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onQualifications(entry)}>
          <Award className="h-4 w-4" /> Qualifications
        </Button>
      </div>
    </CardContent>
  </Card>
);

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PractitionerEntry | null;
  onSubmit: (values: PractitionerFormData) => Promise<void>;
  busy: boolean;
}

const MEDICAL_ROLE_TITLES = [
  'Ship’s doctor',
  'Ship’s nurse',
  'Paramedic',
  'Ship’s medic',
  'Medical officer',
  'Designated first aider',
];

const PractitionerFormDialog: React.FC<FormDialogProps> = ({
  open,
  onOpenChange,
  entry,
  onSubmit,
  busy,
}) => {
  const { vessels } = useVessel();
  const [form, setForm] = useState<PractitionerFormData>(emptyPractitionerForm('medical'));
  const [specialismDraft, setSpecialismDraft] = useState('');

  React.useEffect(() => {
    if (!open) return;
    if (entry) {
      setForm({
        profile_id: entry.profile_id,
        discipline: entry.discipline,
        full_name: entry.full_name,
        role_title: entry.role_title,
        seniority: entry.seniority,
        rank_code: entry.rank_code,
        vessel_id: entry.vessel_id,
        email: entry.email,
        phone: entry.phone,
        specialisms: entry.specialisms,
        bio: entry.bio,
        license_number: entry.license_number,
        license_authority: entry.license_authority,
        license_expiry: entry.license_expiry,
        started_on: entry.started_on,
        ended_on: entry.ended_on,
        is_active: entry.is_active,
        notes: entry.notes,
      });
    } else {
      setForm(emptyPractitionerForm('medical'));
    }
    setSpecialismDraft('');
  }, [open, entry]);

  const set = <K extends keyof PractitionerFormData>(key: K) => (value: PractitionerFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addSpecialism = () => {
    const value = specialismDraft.trim();
    if (!value || form.specialisms.includes(value)) return;
    set('specialisms')([...form.specialisms, value]);
    setSpecialismDraft('');
  };

  const submit = async () => {
    if (!form.full_name.trim()) return;
    await onSubmit(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit medical staff' : 'Add medical staff'}</DialogTitle>
          <DialogDescription>
            Linking a crew profile grants that person access to clinical records across the section.
            Leave it unset to keep them on the roster without access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Crew profile</Label>
          <CrewPicker
            value={form.profile_id}
            includeInactive
            placeholder="Not linked — no clinical access"
            onChange={(profileId, crew) => {
              set('profile_id')(profileId);
              if (crew && !form.full_name.trim()) set('full_name')(crew.fullName);
              if (crew && !form.rank_code) set('rank_code')(crew.rank ?? null);
              if (crew && !form.email) set('email')(crew.email ?? null);
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Full name</Label>
            <Input
              id="staff-name"
              value={form.full_name}
              onChange={(e) => set('full_name')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-role">Role</Label>
            <Select
              value={form.role_title ?? 'none'}
              onValueChange={(v) => set('role_title')(v === 'none' ? null : v)}
            >
              <SelectTrigger id="staff-role">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {MEDICAL_ROLE_TITLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-seniority">Seniority</Label>
            <Select
              value={form.seniority ?? 'practitioner'}
              onValueChange={(v) => set('seniority')(v)}
            >
              <SelectTrigger id="staff-seniority">
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
            <Label htmlFor="staff-rank">Rank code</Label>
            <Input
              id="staff-rank"
              placeholder="MED 2"
              value={form.rank_code ?? ''}
              onChange={(e) => set('rank_code')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-vessel">Vessel</Label>
            <Select
              value={form.vessel_id ?? 'none'}
              onValueChange={(v) => set('vessel_id')(v === 'none' ? null : v)}
            >
              <SelectTrigger id="staff-vessel">
                <SelectValue placeholder="Fleet wide" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Fleet wide</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => set('email')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-licence">Licence number</Label>
            <Input
              id="staff-licence"
              value={form.license_number ?? ''}
              onChange={(e) => set('license_number')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-authority">Issuing authority</Label>
            <Input
              id="staff-authority"
              placeholder="GMC, NMC, HCPC"
              value={form.license_authority ?? ''}
              onChange={(e) => set('license_authority')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-licence-expiry">Licence expires</Label>
            <Input
              id="staff-licence-expiry"
              type="date"
              value={form.license_expiry ?? ''}
              onChange={(e) => set('license_expiry')(e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-started">Joined the roster</Label>
            <Input
              id="staff-started"
              type="date"
              value={form.started_on ?? ''}
              onChange={(e) => set('started_on')(e.target.value || null)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="staff-specialism">Specialisms</Label>
          <div className="flex gap-2">
            <Input
              id="staff-specialism"
              value={specialismDraft}
              placeholder="Emergency care, diving medicine"
              onChange={(e) => setSpecialismDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSpecialism();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addSpecialism}>
              Add
            </Button>
          </div>
          {form.specialisms.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {form.specialisms.map((s) => (
                <Badge
                  key={s}
                  variant="secondary"
                  className="cursor-pointer text-[10px]"
                  onClick={() => set('specialisms')(form.specialisms.filter((x) => x !== s))}
                >
                  {s} ×
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="staff-notes">Notes</Label>
          <Textarea
            id="staff-notes"
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => set('notes')(e.target.value || null)}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="staff-active" className="text-sm">
              On the roster
            </Label>
            <p className="text-xs text-muted-foreground">
              Turning this off removes their clinical access without deleting the record.
            </p>
          </div>
          <Switch id="staff-active" checked={form.is_active} onCheckedChange={set('is_active')} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.full_name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {entry ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const QUALIFICATION_CATEGORIES = [
  { value: 'medical', label: 'Medical' },
  { value: 'first_aid', label: 'First aid' },
  { value: 'safety', label: 'Safety' },
  { value: 'therapy', label: 'Therapy' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'other', label: 'Other' },
];

const COMMON_MEDICAL_QUALIFICATIONS = [
  'STCW Medical First Aid',
  'STCW Medical Care On Board',
  'Ship Captain’s Medical Guide refresher',
  'Advanced Life Support',
  'Basic Life Support and AED',
  'Pre-Hospital Trauma Life Support',
  'Diver Medical Technician',
  'Oxygen administration',
];

const QualificationsDialog: React.FC<{
  entry: PractitionerEntry | null;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}> = ({ entry, onOpenChange, canEdit }) => {
  const quals = usePractitionerQualifications(entry?.id ?? null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('medical');
  const [authority, setAuthority] = useState('');
  const [reference, setReference] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const reset = () => {
    setName('');
    setCategory('medical');
    setAuthority('');
    setReference('');
    setIssueDate('');
    setExpiryDate('');
  };

  const add = async () => {
    if (!name.trim()) return;
    await quals.saveQualification.mutateAsync({
      name: name.trim(),
      category,
      issuing_authority: authority || null,
      reference: reference || null,
      issue_date: issueDate || null,
      expiry_date: expiryDate || null,
    });
    reset();
  };

  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry?.full_name}</DialogTitle>
          <DialogDescription>
            Qualifications and certificates. Expiry dates feed the health alerts.
          </DialogDescription>
        </DialogHeader>

        {quals.isLoading ? (
          <HealthLoading rows={2} />
        ) : quals.qualifications.length === 0 ? (
          <HealthEmpty
            icon={Award}
            title="No qualifications recorded"
            description="Add the certificates this person holds so expiry is tracked."
            className="border-0"
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {quals.qualifications.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{q.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[q.issuing_authority, q.reference, q.issue_date ? `Issued ${formatDate(q.issue_date)}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'No details'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {q.expiry_date ? (
                    <Badge variant="outline" className={cn('text-[10px]', toneClass[expiryTone(q.expiry_date)])}>
                      <CalendarClock className="mr-1 h-3 w-3" />
                      {expiryLabel(q.expiry_date)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      No expiry
                    </Badge>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove qualification"
                      onClick={() => quals.deleteQualification.mutate(q.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium text-foreground">Add a qualification</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="qual-name">Name</Label>
                <Input
                  id="qual-name"
                  list="common-medical-qualifications"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="STCW Medical Care On Board"
                />
                <datalist id="common-medical-qualifications">
                  {COMMON_MEDICAL_QUALIFICATIONS.map((q) => (
                    <option key={q} value={q} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qual-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="qual-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALIFICATION_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qual-authority">Issuing authority</Label>
                <Input
                  id="qual-authority"
                  value={authority}
                  onChange={(e) => setAuthority(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qual-reference">Certificate number</Label>
                <Input
                  id="qual-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qual-issued">Issued</Label>
                <Input
                  id="qual-issued"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qual-expiry">Expires</Label>
                <Input
                  id="qual-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={add} disabled={quals.isMutating || !name.trim()} className="gap-1">
              {quals.isMutating && <Loader2 className="h-4 w-4 animate-spin" />}
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MedicalStaffPage;
