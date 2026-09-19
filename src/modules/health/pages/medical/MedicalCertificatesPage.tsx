import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, FileCheck, Loader2, Plus, Trash2, Upload, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
  PickPersonPrompt,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { PersonClinicalBanner } from '@/modules/health/components/medical/PersonClinicalBanner';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { useFitnessAssessments } from '@/modules/health/hooks/useFitnessAssessments';
import { expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/health/lib/format';

type CrewCertificate = Tables<'crew_certificates'>;

/** Certificate types this page owns. Everything else lives in HRIS. */
const MEDICAL_CERTIFICATE_TYPES = [
  { value: 'Medical', label: 'Medical fitness (ENG1 or equivalent)' },
  { value: 'Medical_Care', label: 'Medical first aid or care on board' },
  { value: 'Vaccination', label: 'Vaccination certificate' },
  { value: 'Dental', label: 'Dental fitness' },
  { value: 'Other_Medical', label: 'Other medical certificate' },
];

const MEDICAL_TYPE_VALUES = MEDICAL_CERTIFICATE_TYPES.map((t) => t.value);

const MEDICAL_CERTS_KEY = ['health', 'medical-certificates'] as const;

/**
 * Medical certificates held as documents. These live in the existing
 * `crew_certificates` table, keyed on `profiles.user_id`, so the expiry
 * alerts and the HRIS compliance strip already understand them. The clinical
 * outcome of a medical is recorded on the fitness page instead.
 */
function useMedicalCertificates(userId: string | null | undefined) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...MEDICAL_CERTS_KEY, userId ?? null],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async (): Promise<CrewCertificate[]> => {
      const { data, error } = await supabase
        .from('crew_certificates')
        .select('*')
        .eq('user_id', userId as string)
        .in('certificate_type', MEDICAL_TYPE_VALUES)
        .order('expiry_date', { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (values: Partial<CrewCertificate> & { certificate_name: string }) => {
      if (!userId) throw new Error('This person has no crew account, so certificates cannot be held for them.');
      if (values.id) {
        const { error } = await supabase
          .from('crew_certificates')
          .update({ ...values, updated_by: user?.id ?? null })
          .eq('id', values.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('crew_certificates').insert({
        ...values,
        user_id: userId,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      } as TablesInsert<'crew_certificates'>);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEDICAL_CERTS_KEY });
      toast({ title: 'Certificate saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crew_certificates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEDICAL_CERTS_KEY });
      toast({ title: 'Certificate removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
    },
  });

  return {
    ...query,
    certificates: query.data ?? [],
    save,
    remove,
    isMutating: save.isPending || remove.isPending,
  };
}

const MedicalCertificatesPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, access, directoryLoading } =
    useSelectedPerson('medical');
  const certificates = useMedicalCertificates(person?.user_id);
  const fitness = useFitnessAssessments(personId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrewCertificate | null>(null);

  const canEdit = !access.loading && access.canEdit;

  const linkedCertificateIds = useMemo(
    () => new Set(fitness.assessments.map((a) => a.certificate_id).filter(Boolean) as string[]),
    [fitness.assessments],
  );

  let body: React.ReactNode;
  if (access.loading || (personId && directoryLoading && !person)) {
    body = <HealthLoading rows={3} />;
  } else if (selfOnly && !myPerson) {
    body = <NoSubjectRecord />;
  } else if (!personId) {
    body = <PickPersonPrompt what="medical certificates" icon={Users} />;
  } else if (person && !person.user_id) {
    body = (
      <div className="space-y-4">
        <PersonClinicalBanner person={person} compact />
        <Alert>
          <Award className="h-4 w-4" />
          <AlertTitle>No crew account</AlertTitle>
          <AlertDescription>
            Certificates are held against a crew account. {person.displayName} is recorded as{' '}
            {person.isCrew ? 'crew without an invitation' : 'a non-crew subject'}, so there is
            nowhere to file them. Record their fitness outcome on the fitness page instead.
          </AlertDescription>
        </Alert>
      </div>
    );
  } else if (certificates.isError) {
    body = <HealthError error={certificates.error} title="Could not load certificates" />;
  } else if (certificates.isLoading) {
    body = <HealthLoading rows={3} />;
  } else {
    body = (
      <div className="space-y-4">
        {person && <PersonClinicalBanner person={person} compact />}

        {certificates.certificates.length === 0 ? (
          <HealthEmpty
            icon={Award}
            title="No medical certificates on file"
            description="File the ENG1, medical care certificate and vaccination certificates so expiry is tracked alongside the rest of their paperwork."
            action={
              canEdit ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" /> Add a certificate
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Certificate</th>
                      <th className="px-4 py-2.5 font-medium">Number</th>
                      <th className="px-4 py-2.5 font-medium">Issued</th>
                      <th className="px-4 py-2.5 font-medium">Expires</th>
                      <th className="px-4 py-2.5 font-medium">Authority</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {certificates.certificates.map((c) => (
                      <tr key={c.id} className="hover:bg-accent/40">
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{c.certificate_name}</span>
                            {linkedCertificateIds.has(c.id) && (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <FileCheck className="h-3 w-3" /> Linked to fitness
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {MEDICAL_CERTIFICATE_TYPES.find((t) => t.value === c.certificate_type)
                              ?.label ?? c.certificate_type}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {c.certificate_number ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {formatDate(c.issue_date)}
                        </td>
                        <td className="px-4 py-2.5">
                          {c.expiry_date ? (
                            <Badge
                              variant="outline"
                              className={cn('text-[10px]', toneClass[expiryTone(c.expiry_date)])}
                            >
                              {expiryLabel(c.expiry_date)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No expiry</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {c.issuing_authority ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            {c.file_url && (
                              <Button asChild variant="ghost" size="sm" className="gap-1">
                                <a href={c.file_url} target="_blank" rel="noreferrer">
                                  <Upload className="h-4 w-4" /> Open
                                </a>
                              </Button>
                            )}
                            {canEdit && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditing(c);
                                    setFormOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Delete certificate"
                                  onClick={() => certificates.remove.mutate(c.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Award}
        scope="medical"
        title="Medical certificates"
        description="The paperwork behind a medical: the certificate, its number and when it runs out."
        actions={
          canEdit &&
          person?.user_id && (
            <Button
              size="sm"
              className="gap-1"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add a certificate
            </Button>
          )
        }
        toolbar={
          !selfOnly ? (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              includeInactive
              placeholder="Choose whose certificates to see"
              className="md:w-[420px]"
            />
          ) : undefined
        }
      />
      {body}

      <CertificateDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        certificate={editing}
        onSubmit={(values) => certificates.save.mutateAsync(values)}
        busy={certificates.isMutating}
      />
    </div>
  );
};

const CertificateDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate: CrewCertificate | null;
  onSubmit: (values: Partial<CrewCertificate> & { certificate_name: string }) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, certificate, onSubmit, busy }) => {
  const [form, setForm] = useState({
    certificate_name: '',
    certificate_type: 'Medical',
    certificate_number: '',
    issue_date: '',
    expiry_date: '',
    issuing_authority: '',
    file_url: '',
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      certificate_name: certificate?.certificate_name ?? '',
      certificate_type: certificate?.certificate_type ?? 'Medical',
      certificate_number: certificate?.certificate_number ?? '',
      issue_date: certificate?.issue_date ?? '',
      expiry_date: certificate?.expiry_date ?? '',
      issuing_authority: certificate?.issuing_authority ?? '',
      file_url: certificate?.file_url ?? '',
      notes: certificate?.notes ?? '',
    });
  }, [open, certificate]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.certificate_name.trim()) return;
    await onSubmit({
      ...(certificate ? { id: certificate.id } : {}),
      certificate_name: form.certificate_name.trim(),
      certificate_type: form.certificate_type,
      certificate_number: form.certificate_number || null,
      issue_date: form.issue_date || null,
      expiry_date: form.expiry_date || null,
      issuing_authority: form.issuing_authority || null,
      file_url: form.file_url || null,
      notes: form.notes || null,
      status: form.expiry_date && form.expiry_date < new Date().toISOString().slice(0, 10)
        ? 'expired'
        : 'valid',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{certificate ? 'Edit certificate' : 'Add a certificate'}</DialogTitle>
          <DialogDescription>
            Certificates filed here appear in the crew member&apos;s documents and feed the existing
            expiry alerts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-name">Name</Label>
            <Input
              id="cert-name"
              value={form.certificate_name}
              onChange={(e) => set('certificate_name')(e.target.value)}
              placeholder="ENG1 Medical Fitness Certificate"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-type">Type</Label>
            <Select value={form.certificate_type} onValueChange={set('certificate_type')}>
              <SelectTrigger id="cert-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDICAL_CERTIFICATE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-number">Certificate number</Label>
            <Input
              id="cert-number"
              value={form.certificate_number}
              onChange={(e) => set('certificate_number')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-issued">Issued</Label>
            <Input
              id="cert-issued"
              type="date"
              value={form.issue_date}
              onChange={(e) => set('issue_date')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cert-expiry">Expires</Label>
            <Input
              id="cert-expiry"
              type="date"
              value={form.expiry_date}
              onChange={(e) => set('expiry_date')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-authority">Issuing authority</Label>
            <Input
              id="cert-authority"
              value={form.issuing_authority}
              onChange={(e) => set('issuing_authority')(e.target.value)}
              placeholder="MCA approved doctor, flag administration"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cert-file">Document link</Label>
            <Input
              id="cert-file"
              value={form.file_url}
              onChange={(e) => set('file_url')(e.target.value)}
              placeholder="Link to the scanned certificate"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cert-notes">Notes</Label>
          <Textarea
            id="cert-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.certificate_name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {certificate ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MedicalCertificatesPage;
