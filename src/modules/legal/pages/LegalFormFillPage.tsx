import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { FormRenderer } from '@/modules/legal/components/forms/FormRenderer';
import { PeopleSelect } from '@/modules/legal/components/requests/PeopleSelect';
import { useLegalDocument } from '@/modules/legal/hooks/useLegalDocuments';
import { useDocumentVersions } from '@/modules/legal/hooks/useDocumentVersions';
import { useFormSubmissions } from '@/modules/legal/hooks/useFormSubmissions';
import { useLegalPeople, useLegalVessels } from '@/modules/legal/hooks/useLegalLookups';
import { emptySchema, parseFormSchema, validateSubmission, type FormData, type FormValue } from '@/modules/legal/lib/forms';
import { errorMessage } from '@/modules/legal/lib/storage';
import { LEGAL_PATHS } from '@/modules/legal/paths';

const LegalFormFillPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const access = useLegalAccess();
  const template = useLegalDocument(templateId);
  const { versions, current, isLoading: versionsLoading } = useDocumentVersions(templateId);
  const { submitForm } = useFormSubmissions(templateId);
  const { vessels } = useLegalVessels();
  const { people } = useLegalPeople();

  const [data, setData] = useState<FormData>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [forName, setForName] = useState('');
  const [forProfile, setForProfile] = useState<string | null>(null);

  const row = template.data;
  const version = current ?? versions[0] ?? null;
  const schema = useMemo(() => parseFormSchema(version?.form_schema) ?? emptySchema(row?.name ?? ''), [version?.form_schema, row?.name]);
  const references = useMemo(
    () => ({ vessel: vessels.map((v) => ({ id: v.id, label: v.name })), crew: people.map((p) => ({ id: p.id, label: p.displayName })) }),
    [vessels, people],
  );
  const crewOptions = useMemo(() => people.map((p) => ({ ...p, key: p.id, subtitle: p.rank ?? p.position ?? null })), [people]);

  const setValue = (id: string, value: FormValue) => {
    setData((d) => ({ ...d, [id]: value }));
    if (errors[id]) setErrors((e) => ({ ...e, [id]: '' }));
  };

  const submit = async () => {
    if (!row) return;
    const found = validateSubmission(schema, data);
    setErrors(found);
    if (Object.keys(found).length) return;
    await submitForm.mutateAsync({
      templateId: row.id,
      versionId: version?.id ?? null,
      form_data: data,
      submitted_for_name: forName || crewOptions.find((c) => c.key === forProfile)?.displayName || null,
      submitted_for_profile_id: forProfile,
    });
    navigate(LEGAL_PATHS.forms);
  };

  if (template.isLoading || versionsLoading) {
    return (
      <LegalShell title="Loading form" backTo={{ label: 'Back to forms', path: LEGAL_PATHS.forms }}>
        <Skeleton className="h-96 w-full" />
      </LegalShell>
    );
  }
  if (template.error || !row || row.document_type !== 'form') {
    return (
      <LegalShell title="Form not found" backTo={{ label: 'Back to forms', path: LEGAL_PATHS.forms }}>
        <Alert variant="destructive">
          <AlertTitle>Could not open this form</AlertTitle>
          <AlertDescription>{template.error ? errorMessage(template.error) : 'It may have been deleted or is not a form.'}</AlertDescription>
        </Alert>
      </LegalShell>
    );
  }

  const notPublished = row.status !== 'active' || !current;
  if (notPublished && !access.canEdit) {
    return (
      <LegalShell title={row.name} backTo={{ label: 'Back to forms', path: LEGAL_PATHS.forms }}>
        <Alert>
          <AlertTitle>Not yet published</AlertTitle>
          <AlertDescription>The legal team has not approved a version of this form yet.</AlertDescription>
        </Alert>
      </LegalShell>
    );
  }

  return (
    <LegalShell title={schema.title || row.name} description={row.description ?? undefined} backTo={{ label: 'Back to forms', path: LEGAL_PATHS.forms }}>
      {notPublished && (
        <Alert>
          <AlertTitle>Preview of an unapproved version</AlertTitle>
          <AlertDescription>Crew cannot fill this in until a version is approved. Submissions you make now are recorded against v{version?.version_number ?? '—'}.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            {schema.description && <p className="mb-5 text-sm text-muted-foreground">{schema.description}</p>}
            <FormRenderer schema={schema} data={data} onChange={setValue} errors={errors} references={references} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Filing on behalf of someone?</h3>
                <p className="text-xs text-muted-foreground">Leave blank if this form is for you.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Crew member</Label>
                <PeopleSelect value={forProfile} options={crewOptions} onChange={(key) => setForProfile(key)} placeholder="Myself" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="for-name">Or a name</Label>
                <Input id="for-name" value={forName} onChange={(e) => setForName(e.target.value)} placeholder="e.g. a guest or contractor" />
              </div>
            </CardContent>
          </Card>
          <Button className="w-full" onClick={submit} disabled={submitForm.isPending || schema.fields.length === 0}>
            <Send className="mr-2 h-4 w-4" /> {submitForm.isPending ? 'Submitting…' : 'Submit form'}
          </Button>
          <p className="text-xs text-muted-foreground">Version {version?.version_number ?? '—'} of this form. The legal team reviews every submission.</p>
        </div>
      </div>
    </LegalShell>
  );
};

export default LegalFormFillPage;
