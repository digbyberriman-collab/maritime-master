import React, { useEffect, useState } from 'react';
import { BookUser, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProfileDocuments, ProfileDocumentsPatch } from '@/modules/hris/hooks/useRightToWork';
import { expiryLabel, formatDate } from '@/modules/hris/lib/format';
import { statusFromDate } from '@/modules/hris/lib/rightToWork';
import { StatusChip } from './StatusChip';

interface IdentityDocumentsCardProps {
  documents: ProfileDocuments | null;
  isLoading: boolean;
  canEdit: boolean;
  saving?: boolean;
  onSave: (before: ProfileDocumentsPatch, patch: ProfileDocumentsPatch) => Promise<unknown>;
}

const toPatch = (d: ProfileDocuments | null): ProfileDocumentsPatch => ({
  nationality: d?.nationality ?? null,
  passport_number: d?.passport_number ?? null,
  passport_expiry: d?.passport_expiry ?? null,
  visa_status: d?.visa_status ?? null,
  visa_expiry: d?.visa_expiry ?? null,
  medical_expiry: d?.medical_expiry ?? null,
});

const DateRow: React.FC<{ label: string; value: string | null | undefined; extra?: string | null }> = ({ label, value, extra }) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <div className="min-w-0">
      <p className="text-sm text-foreground">{label}</p>
      <p className="truncate text-xs text-muted-foreground">{extra ? `${extra} · ` : ''}{value ? `${formatDate(value)} · ${expiryLabel(value)}` : 'Not recorded'}</p>
    </div>
    <StatusChip status={statusFromDate(value)} />
  </div>
);

/** Passport, nationality, visa and medical held on the profile; editable by HR editors. */
export const IdentityDocumentsCard: React.FC<IdentityDocumentsCardProps> = ({ documents, isLoading, canEdit, saving, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDocumentsPatch>(toPatch(documents));

  useEffect(() => {
    if (!editing) setDraft(toPatch(documents));
  }, [documents, editing]);

  const set = (key: keyof ProfileDocumentsPatch, value: string) => setDraft((d) => ({ ...d, [key]: value.trim() === '' ? null : value }));

  const save = async () => {
    await onSave(toPatch(documents), draft);
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><BookUser className="h-4 w-4 text-primary" /> Identity documents</CardTitle>
          <CardDescription>Held on the crew profile and fed into the expiry alerts.</CardDescription>
        </div>
        {canEdit && !isLoading && (
          editing ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}><X className="h-4 w-4" /></Button>
              <Button size="sm" onClick={save} disabled={saving} className="gap-1">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          )
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="id-nationality">Nationality</Label>
              <Input id="id-nationality" value={draft.nationality ?? ''} onChange={(e) => set('nationality', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-passport">Passport number</Label>
              <Input id="id-passport" value={draft.passport_number ?? ''} onChange={(e) => set('passport_number', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-passport-exp">Passport expiry</Label>
              <Input id="id-passport-exp" type="date" value={draft.passport_expiry ?? ''} onChange={(e) => set('passport_expiry', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-medical-exp">Medical certificate expiry</Label>
              <Input id="id-medical-exp" type="date" value={draft.medical_expiry ?? ''} onChange={(e) => set('medical_expiry', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-visa-status">Visa status</Label>
              <Input id="id-visa-status" value={draft.visa_status ?? ''} onChange={(e) => set('visa_status', e.target.value)} placeholder="e.g. B1/B2 multiple entry" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-visa-exp">Visa expiry</Label>
              <Input id="id-visa-exp" type="date" value={draft.visa_expiry ?? ''} onChange={(e) => set('visa_expiry', e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="divide-y">
            <div className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm text-foreground">Nationality</p>
                <p className="text-xs text-muted-foreground">{documents?.nationality ?? 'Not recorded'}</p>
              </div>
            </div>
            <DateRow label="Passport" value={documents?.passport_expiry} extra={documents?.passport_number ? `No. ${documents.passport_number}` : 'No number'} />
            <DateRow label="Medical certificate" value={documents?.medical_expiry} />
            <DateRow label="Visa (profile)" value={documents?.visa_expiry} extra={documents?.visa_status ?? null} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default IdentityDocumentsCard;
