import React, { useMemo, useState } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Loader2, MapPin, Pencil, Phone, Plus, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { NextOfKinCard, NextOfKinFormDialog, useCrewNextOfKin, type NextOfKin } from '@/modules/hris';
import { CountrySelect } from '@/modules/crew/components/CountrySelect';
import { useCountries } from '@/modules/crew/hooks/useReferenceData';
import {
  useCrewPersonalDetails,
  usePersonalDetailsMutations,
  type PersonalDetailsState,
} from '@/modules/crew/hooks/useCrewPersonalDetails';
import {
  contactDefaults,
  contactDetailsSchema,
  contactPayload,
  profileSaveRefusal,
  SAVE_UNAVAILABLE,
  type ContactDetailsValues,
} from '@/modules/crew/lib/personalDetailsSchema';
import { countryForDialCode, formatPhone, splitLegacyPhone, telHref } from '@/modules/crew/lib/phone';
import type { ProfileTabProps } from '@/modules/crew/lib/profileTabs';
import type { Country } from '@/modules/crew/types/domain';
import { Fact, FactGrid } from './CurrentEmploymentCard';

export const NOK_RESTRICTED = 'Next of kin are shown to HR and to the crew member themselves.';

const PhoneLink: React.FC<{ dial: string | null | undefined; number: string | null | undefined }> = ({ dial, number }) => {
  const shown = formatPhone(dial, number);
  const href = telHref(dial, number);
  if (!shown) return null;
  return href ? (
    <a href={href} className="inline-flex min-h-6 items-center gap-1.5 text-foreground underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-11">
      <Phone aria-hidden="true" className="size-3.5 text-muted-foreground" />
      {shown}
    </a>
  ) : (
    <>{shown}</>
  );
};

/**
 * The Contact tab (gap/04 C20, T-68): the person's address with the
 * repatriation airport, their phone and mobile as a dial code plus the
 * national number (rendered once), and their next of kin through the HRIS
 * cards and form (several allowed, one primary). The person edits their own
 * contact details; an editor anyone's on their vessel. Next of kin follow
 * the HRIS rule: HR and the person themselves.
 *
 * D-01: while crew_personal_details is missing the address is not there yet
 * and the phone shows as profiles recorded it, read-only.
 */
const ContactTab: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const state = useCrewPersonalDetails(vessel.companyId, profile.profileId);
  const mutations = usePersonalDetailsMutations(vessel.companyId, profile.profileId);
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <div className="min-w-0">
        {state.status === 'idle' || state.status === 'loading' ? (
          <Card>
            <CardContent className="space-y-3 p-4" aria-busy="true" aria-label="Loading contact details">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ) : state.status === 'error' ? (
          <PageError error={state.error} onRetry={state.retry} title="The contact details could not load" treatMissingAsOff={false} headingLevel={2} />
        ) : state.mode === 'legacy' ? (
          <LegacyContact state={state} />
        ) : (
          <ContactCard state={state} canEdit={profile.canEditSelf} mutations={mutations} />
        )}
      </div>
      <div className="min-w-0">
        <NextOfKinSection profileId={profile.profileId} isOwn={profile.isOwn} name={profile.displayName} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- D-01

const LegacyContact: React.FC<{ state: Extract<PersonalDetailsState, { mode: 'legacy' }> }> = ({ state }) => (
  <Card data-profile-card="contact">
    <CardHeader className="flex-row items-center gap-2 space-y-0">
      <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
      <CardTitle className="type-subtitle">Address and phones</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <Alert variant="info" data-contact-notice="not-applied">
        <Info aria-hidden="true" className="size-4" />
        <AlertDescription>{SAVE_UNAVAILABLE} The home address and repatriation airport arrive with it.</AlertDescription>
      </Alert>
      <FactGrid columns={1}>
        <Fact label="Phone (as recorded)">{state.legacy.phone}</Fact>
        <Fact label="Sign-in email">{state.names.email}</Fact>
      </FactGrid>
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------- address and phones

type ServerState = Extract<PersonalDetailsState, { mode: 'server' }>;
type Mutations = ReturnType<typeof usePersonalDetailsMutations>;

const addressLines = (d: ServerState['details'], countries: readonly Country[]): string[] => {
  if (!d) return [];
  const country = d.country_code ? countries.find((c) => c.iso2 === d.country_code)?.name ?? d.country_code : null;
  return [d.address_line1, d.address_line2, [d.postal_code, d.city].filter(Boolean).join(' '), d.region, country].filter(
    (line): line is string => Boolean(line && line.trim()),
  );
};

const ContactCard: React.FC<{ state: ServerState; canEdit: boolean; mutations: Mutations }> = ({ state, canEdit, mutations }) => {
  const [editing, setEditing] = useState(false);
  const countries = useCountries();
  const d = state.details;
  const lines = addressLines(d, countries.items);
  return (
    <Card data-profile-card="contact">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
          <CardTitle className="type-subtitle">Address and phones</CardTitle>
        </div>
        {canEdit && !editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} className="[@media(pointer:coarse)]:h-11">
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <ContactForm state={state} countries={countries.items} mutations={mutations} onDone={() => setEditing(false)} />
        ) : (
          <FactGrid>
            <Fact label="Home address" wide testId="address">
              {lines.length ? (
                <span className="block">
                  {lines.map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              ) : null}
            </Fact>
            <Fact label="Repatriation airport">{d?.repatriation_airport ? <span className="type-mono">{d.repatriation_airport}</span> : null}</Fact>
            <Fact label="Sign-in email">{state.names.email}</Fact>
            <Fact label="Phone">{formatPhone(d?.phone_dial_code, d?.phone_number) ? <PhoneLink dial={d?.phone_dial_code} number={d?.phone_number} /> : null}</Fact>
            <Fact label="Mobile">{formatPhone(d?.mobile_dial_code, d?.mobile_number) ? <PhoneLink dial={d?.mobile_dial_code} number={d?.mobile_number} /> : null}</Fact>
          </FactGrid>
        )}
      </CardContent>
    </Card>
  );
};

const CONTACT_FIELDS = new Set<string>([
  'address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country_code', 'repatriation_airport', 'phone_dial_code', 'phone_number',
  'mobile_dial_code', 'mobile_number',
]);

const ContactForm: React.FC<{ state: ServerState; countries: readonly Country[]; mutations: Mutations; onDone: () => void }> = ({ state, countries, mutations, onDone }) => {
  const initial = useMemo(() => contactDefaults(state.details), [state.details]);
  const form = useForm<ContactDetailsValues>({ resolver: zodResolver(contactDetailsSchema), defaultValues: initial });
  const dialCodes = useMemo(() => countries.map((c) => c.dialCode).filter((c): c is string => Boolean(c)), [countries]);
  const prefer = [state.details?.country_code, state.details?.residency_country_code, state.details?.nationality_code];

  const submit = form.handleSubmit(async (values) => {
    const payload = contactPayload(values, initial);
    if (Object.keys(payload).length === 0) {
      notify.info('Nothing changed');
      onDone();
      return;
    }
    try {
      await mutations.details.mutateAsync(payload);
      notify.success('Contact details saved');
      onDone();
    } catch (error) {
      const refusal = profileSaveRefusal(error);
      if (refusal.field && CONTACT_FIELDS.has(refusal.field)) {
        form.setError(refusal.field as FieldPath<ContactDetailsValues>, { message: refusal.message }, { shouldFocus: true });
      } else {
        notify.error(refusal.message, { title: 'The contact details were not saved' });
      }
    }
  });

  const text = (name: FieldPath<ContactDetailsValues>, label: string, opts: { autoComplete?: string; className?: string; description?: string; upper?: boolean; maxLength?: number } = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={opts.className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              autoComplete={opts.autoComplete ?? 'off'}
              maxLength={opts.maxLength}
              onChange={(event) => field.onChange(opts.upper ? event.target.value.toUpperCase() : event.target.value)}
            />
          </FormControl>
          {opts.description ? <FormDescription>{opts.description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const phone = (dialName: 'phone_dial_code' | 'mobile_dial_code', numberName: 'phone_number' | 'mobile_number', label: string) => (
    <PhoneField
      label={label}
      countries={countries}
      dialCodes={dialCodes}
      prefer={prefer}
      dial={form.watch(dialName)}
      onDial={(dial) => form.setValue(dialName, dial, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
      numberField={
        <FormField
          control={form.control}
          name={numberName}
          render={({ field }) => (
            <FormItem className="min-w-0 flex-1">
              <FormLabel className="sr-only">{`${label} number`}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="Number without the dial code"
                  onChange={(event) => {
                    const value = event.target.value;
                    // A pasted international number is split into its two fields (T-68).
                    if (/^\s*(\+|00)/.test(value)) {
                      const parts = splitLegacyPhone(value, dialCodes);
                      if (parts?.dialCode) {
                        form.setValue(dialName, parts.dialCode, { shouldDirty: true });
                        field.onChange(parts.national);
                        return;
                      }
                    }
                    field.onChange(value);
                  }}
                />
              </FormControl>
            </FormItem>
          )}
        />
      }
      dialError={form.formState.errors[dialName]?.message}
      numberError={form.formState.errors[numberName]?.message}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-6" noValidate aria-label="Edit contact details">
        <fieldset className="space-y-4" disabled={mutations.saving}>
          <legend className="type-eyebrow text-muted-foreground">Home address</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('address_line1', 'Address line 1', { autoComplete: 'address-line1', className: 'sm:col-span-2' })}
            {text('address_line2', 'Address line 2', { autoComplete: 'address-line2', className: 'sm:col-span-2' })}
            {text('city', 'Town or city', { autoComplete: 'address-level2' })}
            {text('region', 'Region or state', { autoComplete: 'address-level1' })}
            {text('postal_code', 'Postal code', { autoComplete: 'postal-code' })}
            <FormField
              control={form.control}
              name="country_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <CountrySelect value={field.value || null} onChange={(iso2) => field.onChange(iso2 ?? '')} label="Country" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {text('repatriation_airport', 'Repatriation airport', { upper: true, maxLength: 3, description: 'The airport they fly home to, as its three-letter code (for example LHR).' })}
          </div>
        </fieldset>
        <fieldset className="space-y-4" disabled={mutations.saving}>
          <legend className="type-eyebrow text-muted-foreground">Phones</legend>
          {phone('phone_dial_code', 'phone_number', 'Phone')}
          {phone('mobile_dial_code', 'mobile_number', 'Mobile')}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onDone} disabled={mutations.saving}>
            Cancel
          </Button>
          <Button type="submit" variant="signal" disabled={mutations.saving}>
            {mutations.saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Save
          </Button>
        </div>
      </form>
    </Form>
  );
};

/** A dial code (picked by country) and the national number, side by side; stacked on a phone. */
const PhoneField: React.FC<{
  label: string;
  countries: readonly Country[];
  dialCodes: readonly string[];
  prefer: readonly (string | null | undefined)[];
  dial: string;
  onDial: (dial: string) => void;
  numberField: React.ReactNode;
  dialError?: string;
  numberError?: string;
}> = ({ label, countries, prefer, dial, onDial, numberField, dialError, numberError }) => {
  const [pickedIso2, setPickedIso2] = useState<string | null>(null);
  const shown = pickedIso2 && countries.find((c) => c.iso2 === pickedIso2)?.dialCode === dial ? pickedIso2 : countryForDialCode(dial, countries, prefer)?.iso2 ?? null;
  return (
    <div className="space-y-2" role="group" aria-label={label}>
      <p className="type-body-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="sm:w-56 sm:shrink-0">
          <CountrySelect
            value={shown}
            onChange={(iso2, country) => {
              setPickedIso2(iso2);
              onDial(country?.dialCode ?? '');
            }}
            label={`${label} dial code`}
            mode="dialCode"
          />
        </div>
        {numberField}
      </div>
      {dialError ? <p className="type-caption text-critical">{dialError}</p> : null}
      {numberError ? <p className="type-caption text-critical">{numberError}</p> : null}
    </div>
  );
};

// ---------------------------------------------------------------- next of kin (HRIS)

const NextOfKinSection: React.FC<{ profileId: string; isOwn: boolean; name: string }> = ({ profileId, isOwn, name }) => {
  const hr = useHrAccess();
  const canSee = isOwn || (!hr.loading && hr.canView);
  const canEdit = isOwn || (!hr.loading && hr.canEdit);
  return (
    <Card data-profile-card="next-of-kin">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Users aria-hidden="true" className="size-4 text-muted-foreground" />
        <CardTitle className="type-subtitle">Next of kin</CardTitle>
      </CardHeader>
      <CardContent>
        {hr.loading && !isOwn ? (
          <Skeleton className="h-16 w-full" aria-label="Loading next of kin" />
        ) : canSee ? (
          <NextOfKinList profileId={profileId} canEdit={canEdit} name={name} />
        ) : (
          <p className="type-body text-muted-foreground" data-nok-restricted="">
            {NOK_RESTRICTED}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const NextOfKinList: React.FC<{ profileId: string; canEdit: boolean; name: string }> = ({ profileId, canEdit, name }) => {
  const nok = useCrewNextOfKin(profileId);
  const [dialog, setDialog] = useState<{ contact: NextOfKin | null } | null>(null);
  const [removing, setRemoving] = useState<NextOfKin | null>(null);

  if (nok.isLoading) return <Skeleton className="h-16 w-full" aria-label="Loading next of kin" />;
  if (nok.error) {
    return <PageError variant="inline" error={nok.error} onRetry={() => void nok.refetch()} title="Next of kin could not load" treatMissingAsOff={false} />;
  }
  const ordered = [...(nok.primary ? [nok.primary] : []), ...nok.others];
  return (
    <div className="space-y-3">
      {ordered.length === 0 ? (
        <p className="type-body text-muted-foreground">No next of kin recorded for {name} yet.</p>
      ) : (
        ordered.map((contact) => (
          <NextOfKinCard
            key={contact.id}
            contact={contact}
            emphasis={contact.is_primary ? 'primary' : 'secondary'}
            canEdit={canEdit}
            busy={nok.isMutating}
            onEdit={(c) => setDialog({ contact: c })}
            onDelete={(c) => setRemoving(c)}
            onSetPrimary={(c) => nok.setPrimary.mutate(c)}
          />
        ))
      )}
      {canEdit ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ contact: null })} disabled={nok.isMutating}>
          <Plus aria-hidden="true" />
          Add next of kin
        </Button>
      ) : null}
      {dialog ? (
        <NextOfKinFormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          contact={dialog.contact}
          isFirst={nok.contacts.length === 0}
          submitting={nok.createContact.isPending || nok.updateContact.isPending}
          onSubmit={(values) =>
            dialog.contact ? nok.updateContact.mutateAsync({ id: dialog.contact.id, values }) : nok.createContact.mutateAsync(values)
          }
        />
      ) : null}
      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be listed as {name}&rsquo;s next of kin.{removing?.is_primary ? ' Another contact becomes the primary one.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing) nok.deleteContact.mutate(removing);
                setRemoving(null);
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

export default ContactTab;
