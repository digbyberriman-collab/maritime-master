import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Loader2, Lock, Pencil, UserRound } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { todayDateOnly } from '@/shared/lib/form';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { CountrySelect } from '@/modules/crew/components/CountrySelect';
import { LanguageSelect } from '@/modules/crew/components/LanguageSelect';
import { useCountries, useLanguages } from '@/modules/crew/hooks/useReferenceData';
import { formatDay } from '@/modules/crew/hooks/useCrewProfile';
import {
  useCrewPersonalDetails,
  usePersonalDetailsMutations,
  type LanguageEntry,
  type PersonalDetailsState,
} from '@/modules/crew/hooks/useCrewPersonalDetails';
import {
  HAS_CHILDREN,
  HAS_CHILDREN_LABEL,
  LANGUAGE_SLOT_LABEL,
  MARITAL_STATUSES,
  MARITAL_STATUS_LABEL,
  SEXES,
  SEX_LABEL,
  TITLES,
  TITLE_LABEL,
  languagesPayload,
  personalDefaults,
  personalDetailsSchema,
  personalPayload,
  profileSaveRefusal,
  IDENTITY_LOCKED,
  SAVE_UNAVAILABLE,
  type PersonalDetailsValues,
} from '@/modules/crew/lib/personalDetailsSchema';
import type { ProfileTabProps } from '@/modules/crew/lib/profileTabs';
import { LANGUAGE_PROFICIENCIES, LANGUAGE_PROFICIENCY_LABEL, type Country } from '@/modules/crew/types/domain';
import { BiographyCard } from './BiographyCard';
import { CurrentEmploymentCard, Fact, FactGrid } from './CurrentEmploymentCard';
import { LeaveBalanceCard } from './LeaveBalanceCard';
import { SignatureCard } from './SignatureCard';


const EDIT_PARAM = 'edit';
const NONE = '__none';

/** "34" from a date of birth (whole years to today), or null. */
const ageOn = (dob: string | null | undefined, today: string): number | null => {
  if (!dob) return null;
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  if (!y || !ty) return null;
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};

const countryText = (countries: readonly Country[], iso2: string | null | undefined, mode: 'country' | 'nationality'): React.ReactNode => {
  if (!iso2) return null;
  const c = countries.find((x) => x.iso2 === iso2);
  if (!c) return iso2;
  const label = mode === 'nationality' ? c.demonym ?? c.name : c.name;
  return (
    <span className="inline-flex items-center gap-1.5">
      {c.flagEmoji ? <span aria-hidden="true">{c.flagEmoji}</span> : null}
      {label}
    </span>
  );
};

/** A Select over a fixed list that may be left empty ("Not recorded"). */
function OptionalSelect<T extends string>({
  value,
  onChange,
  options,
  labels,
  label,
  disabled,
  id,
}: {
  value: T | '';
  onChange: (next: T | '') => void;
  options: readonly T[];
  labels: Record<T, string>;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? '' : (next as T))} disabled={disabled}>
      <SelectTrigger id={id} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not recorded</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels[o]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const LoadingCard: React.FC = () => (
  <Card>
    <CardContent className="space-y-4 p-4" aria-busy="true" aria-label="Loading personal details">
      <Skeleton className="h-5 w-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </CardContent>
  </Card>
);

/**
 * The Personal tab (gap/04 C17, C19, C21, C55): the person's identity and
 * personal details with their languages, edited in place (Cancel and Save,
 * RHF + zod, W1 field rules), beside Current employment, the Leave balance
 * (X1-09B: from the employment terms' allowance, else the vessel's leave
 * policy; shown to the person and to planner, leave and HR viewers),
 * Biography and the stored signature. Identity fields need an editor (HR or crew_profiles.edit
 * on the vessel); the person edits their own self fields. Edit profile in
 * the header opens the form here (?edit=1).
 *
 * D-01: while crew_personal_details is missing the tab shows what profiles
 * holds, read-only, and says saving arrives with the crew update.
 */
const PersonalTab: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const state = useCrewPersonalDetails(vessel.companyId, profile.profileId);
  const { vessels } = useVessel();
  const nameOfVessel = (id: string) => vessels.find((v) => v.id === id)?.name ?? null;
  const mutations = usePersonalDetailsMutations(vessel.companyId, profile.profileId);

  if (state.status === 'idle' || state.status === 'loading') return <LoadingCard />;
  if (state.status === 'error') {
    return <PageError error={state.error} onRetry={state.retry} title="The personal details could not load" treatMissingAsOff={false} headingLevel={2} />;
  }

  const legacy = state.mode === 'legacy';
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-personal-mode={state.mode}>
      <div className="min-w-0 space-y-4">
        {legacy ? <LegacyPersonal state={state} /> : <PersonalDetailsCard state={state} profile={profile} mutations={mutations} />}
      </div>
      <div className="min-w-0 space-y-4">
        <CurrentEmploymentCard vessel={vessel} profile={profile} nameOfVessel={nameOfVessel} />
        <LeaveBalanceCard vessel={vessel} profile={profile} />
        <BiographyCard
          biography={state.mode === 'server' ? state.details?.biography ?? null : null}
          canEdit={profile.canEditSelf}
          unavailableReason={legacy ? SAVE_UNAVAILABLE : null}
          saving={mutations.details.isPending}
          onSave={(biography) => mutations.details.mutateAsync({ biography })}
        />
        {profile.isOwn ? <SignatureCard companyId={vessel.companyId} profileId={profile.profileId} /> : null}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- D-01: the profile fields, read-only

const LegacyPersonal: React.FC<{ state: Extract<PersonalDetailsState, { mode: 'legacy' }> }> = ({ state }) => (
  <Card data-profile-card="personal">
    <CardHeader className="flex-row items-center gap-2 space-y-0">
      <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
      <CardTitle className="type-subtitle">Personal details</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <Alert variant="info" data-personal-notice="not-applied">
        <Info aria-hidden="true" className="size-4" />
        <AlertDescription>{SAVE_UNAVAILABLE}</AlertDescription>
      </Alert>
      <FactGrid>
        <Fact label="First name">{state.names.first_name}</Fact>
        <Fact label="Last name">{state.names.last_name}</Fact>
        <Fact label="Preferred name">{state.names.preferred_name}</Fact>
        <Fact label="Sign-in email">{state.names.email}</Fact>
        <Fact label="Date of birth">{formatDay(state.legacy.dateOfBirth)}</Fact>
        <Fact label="Place of birth">{state.legacy.placeOfBirth}</Fact>
        <Fact label="Nationality">{state.legacy.nationality}</Fact>
        <Fact label="Gender">{state.legacy.gender}</Fact>
        <Fact label="Usual place of embarkation">{state.legacy.embarkationPort}</Fact>
      </FactGrid>
    </CardContent>
  </Card>
);

// ---------------------------------------------------------------- the details card (view and edit)

type ServerState = Extract<PersonalDetailsState, { mode: 'server' }>;
type Mutations = ReturnType<typeof usePersonalDetailsMutations>;

const LanguageFacts: React.FC<{ languages: readonly LanguageEntry[]; names: ReadonlyMap<string, string> }> = ({ languages, names }) => {
  if (languages.length === 0) return <p className="type-body text-muted-foreground">No languages recorded.</p>;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Languages">
      {languages.map((l) => (
        <li key={l.slot} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 type-body-sm">
          <span className="text-foreground">{names.get(l.language_code) ?? l.language_code}</span>
          <span className="text-muted-foreground">{l.slot === 1 ? 'Mother tongue' : l.proficiency ? LANGUAGE_PROFICIENCY_LABEL[l.proficiency] : ''}</span>
        </li>
      ))}
    </ul>
  );
};

const PersonalDetailsCard: React.FC<{ state: ServerState; profile: ProfileTabProps['profile']; mutations: Mutations }> = ({ state, profile, mutations }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const editing = searchParams.get(EDIT_PARAM) === '1' && (profile.canEdit || profile.canEditSelf);
  const countries = useCountries();
  const languages = useLanguages();
  const languageNames = useMemo(() => new Map(languages.items.map((l) => [l.code, l.name])), [languages.items]);
  const today = todayDateOnly();
  const d = state.details;

  const setEditing = (on: boolean) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (on) next.set(EDIT_PARAM, '1');
        else next.delete(EDIT_PARAM);
        return next;
      },
      { replace: true },
    );

  const age = ageOn(d?.date_of_birth, today);
  return (
    <Card data-profile-card="personal">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
          <CardTitle className="type-subtitle">Personal details</CardTitle>
        </div>
        {!editing && (profile.canEdit || profile.canEditSelf) ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} className="[@media(pointer:coarse)]:h-11">
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <PersonalForm state={state} profile={profile} mutations={mutations} onDone={() => setEditing(false)} />
        ) : (
          <div className="space-y-6">
            <section aria-labelledby="personal-identity" className="space-y-3">
              <h4 id="personal-identity" className="type-eyebrow text-muted-foreground">
                Identity
              </h4>
              <FactGrid>
                <Fact label="Name" wide>
                  {[d?.title ? TITLE_LABEL[d.title] : null, state.names.first_name, d?.middle_name, state.names.last_name].filter(Boolean).join(' ')}
                </Fact>
                <Fact label="Preferred name">{state.names.preferred_name}</Fact>
                <Fact label="Sex">{d?.sex ? SEX_LABEL[d.sex] : null}</Fact>
                <Fact label="Date of birth">{d?.date_of_birth ? `${formatDay(d.date_of_birth)}${age !== null ? ` (${age})` : ''}` : null}</Fact>
                <Fact label="Place of birth">{d?.place_of_birth}</Fact>
                <Fact label="Nationality">{countryText(countries.items, d?.nationality_code, 'nationality')}</Fact>
                <Fact label="Second nationality">{countryText(countries.items, d?.dual_nationality_code, 'nationality')}</Fact>
                <Fact label="Country of residence">{countryText(countries.items, d?.residency_country_code, 'country')}</Fact>
                <Fact label="Crew number">{d?.crew_number ? <span className="type-mono">{d.crew_number}</span> : null}</Fact>
              </FactGrid>
            </section>
            <section aria-labelledby="personal-work" className="space-y-3">
              <h4 id="personal-work" className="type-eyebrow text-muted-foreground">
                Work and travel
              </h4>
              <FactGrid>
                <Fact label="Sign-in email">{state.names.email}</Fact>
                <Fact label="Work email">{d?.work_email}</Fact>
                <Fact label="Usual place of embarkation">{d?.place_of_embarkation}</Fact>
              </FactGrid>
            </section>
            <section aria-labelledby="personal-about" className="space-y-3">
              <h4 id="personal-about" className="type-eyebrow text-muted-foreground">
                About
              </h4>
              <FactGrid>
                <Fact label="Height">{d?.height_cm ? `${d.height_cm} cm` : null}</Fact>
                <Fact label="Weight">{d?.weight_kg ? `${d.weight_kg} kg` : null}</Fact>
                <Fact label="Marital status">{d?.marital_status ? MARITAL_STATUS_LABEL[d.marital_status] : null}</Fact>
                <Fact label="Children">{d?.has_children ? HAS_CHILDREN_LABEL[d.has_children] : null}</Fact>
              </FactGrid>
            </section>
            <section aria-labelledby="personal-languages" className="space-y-3">
              <h4 id="personal-languages" className="type-eyebrow text-muted-foreground">
                Languages
              </h4>
              <LanguageFacts languages={state.languages} names={languageNames} />
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const FORM_FIELDS = new Set<string>([
  'title', 'first_name', 'middle_name', 'last_name', 'preferred_name', 'sex', 'date_of_birth', 'place_of_birth', 'nationality_code',
  'dual_nationality_code', 'residency_country_code', 'work_email', 'crew_number', 'place_of_embarkation', 'height_cm', 'weight_kg',
  'marital_status', 'has_children',
]);

const PersonalForm: React.FC<{ state: ServerState; profile: ProfileTabProps['profile']; mutations: Mutations; onDone: () => void }> = ({
  state,
  profile,
  mutations,
  onDone,
}) => {
  const initial = useMemo(() => personalDefaults(state.details, state.names, state.languages), [state.details, state.names, state.languages]);
  const form = useForm<PersonalDetailsValues>({ resolver: zodResolver(personalDetailsSchema), defaultValues: initial });
  const identity = profile.canEdit;
  const self = profile.canEditSelf;
  const watchedLanguages = form.watch('languages');
  const today = todayDateOnly();

  const submit = form.handleSubmit(async (values) => {
    const payload = personalPayload(values, initial, { identity, self });
    const languageRows = self ? languagesPayload(values, initial) : null;
    if (Object.keys(payload).length === 0 && !languageRows) {
      notify.info('Nothing changed');
      onDone();
      return;
    }
    let detailsSaved = false;
    if (Object.keys(payload).length > 0) {
      try {
        await mutations.details.mutateAsync(payload);
        detailsSaved = true;
      } catch (error) {
        const refusal = profileSaveRefusal(error);
        if (refusal.field && FORM_FIELDS.has(refusal.field)) {
          form.setError(refusal.field as FieldPath<PersonalDetailsValues>, { message: refusal.message }, { shouldFocus: true });
        } else {
          notify.error(refusal.message, { title: 'The personal details were not saved' });
        }
        return;
      }
    }
    if (languageRows) {
      try {
        await mutations.languages.mutateAsync(languageRows);
      } catch (error) {
        const refusal = profileSaveRefusal(error);
        if (detailsSaved) {
          notify.warning('Partly saved', { description: `The personal details were saved. The languages were not: ${refusal.message}` });
        } else {
          notify.error(refusal.message, { title: 'The languages were not saved' });
        }
        return;
      }
    }
    notify.success('Personal details saved');
    onDone();
  });

  const text = (name: FieldPath<PersonalDetailsValues>, label: string, opts: { disabled?: boolean; type?: string; inputMode?: 'numeric' | 'email' | 'text'; autoComplete?: string; description?: string; max?: string } = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={typeof field.value === 'string' ? field.value : ''}
              type={opts.type ?? 'text'}
              inputMode={opts.inputMode}
              autoComplete={opts.autoComplete ?? 'off'}
              disabled={opts.disabled}
              max={opts.max}
            />
          </FormControl>
          {opts.description ? <FormDescription>{opts.description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-6" noValidate aria-label="Edit personal details">
        <fieldset className="space-y-4" disabled={mutations.saving}>
          <legend className="flex w-full flex-wrap items-center justify-between gap-2 type-eyebrow text-muted-foreground">
            Identity
            {!identity ? (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal type-caption text-muted-foreground">
                <Lock aria-hidden="true" className="size-3.5" />
                {IDENTITY_LOCKED}
              </span>
            ) : null}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <OptionalSelect value={field.value} onChange={field.onChange} options={TITLES} labels={TITLE_LABEL} label="Title" disabled={!identity} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {text('first_name', 'First name', { disabled: !identity, autoComplete: 'given-name' })}
            {text('middle_name', 'Middle name', { disabled: !identity, autoComplete: 'additional-name' })}
            {text('last_name', 'Last name', { disabled: !identity, autoComplete: 'family-name' })}
            {text('preferred_name', 'Preferred name', { disabled: !identity, description: 'Shown instead of the first name on lists.' })}
            <FormField
              control={form.control}
              name="sex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sex</FormLabel>
                  <FormControl>
                    <OptionalSelect value={field.value} onChange={field.onChange} options={SEXES} labels={SEX_LABEL} label="Sex" disabled={!identity} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {text('date_of_birth', 'Date of birth', { disabled: !identity, type: 'date', max: today })}
            {text('place_of_birth', 'Place of birth', { disabled: !identity })}
            <FormField
              control={form.control}
              name="nationality_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nationality</FormLabel>
                  <FormControl>
                    <CountrySelect value={field.value || null} onChange={(iso2) => field.onChange(iso2 ?? '')} label="Nationality" mode="nationality" disabled={!identity} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dual_nationality_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Second nationality</FormLabel>
                  <FormControl>
                    <CountrySelect value={field.value || null} onChange={(iso2) => field.onChange(iso2 ?? '')} label="Second nationality" mode="nationality" disabled={!identity} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="residency_country_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country of residence</FormLabel>
                  <FormControl>
                    <CountrySelect value={field.value || null} onChange={(iso2) => field.onChange(iso2 ?? '')} label="Country of residence" disabled={!identity} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {text('crew_number', 'Crew number', { disabled: !identity, description: 'Optional. Unique within the company.' })}
          </div>
        </fieldset>

        <fieldset className="space-y-4" disabled={mutations.saving}>
          <legend className="type-eyebrow text-muted-foreground">Work and travel</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="type-body-sm font-medium text-foreground">Sign-in email</p>
              <p className="break-words type-body text-muted-foreground">{state.names.email ?? 'Not recorded'}</p>
              <p className="type-caption text-muted-foreground">Changed in Users &amp; Access, because it decides who can sign in.</p>
            </div>
            {text('work_email', 'Work email', { disabled: !identity, type: 'email', inputMode: 'email' })}
            {text('place_of_embarkation', 'Usual place of embarkation', { disabled: !identity })}
          </div>
        </fieldset>

        <fieldset className="space-y-4" disabled={mutations.saving}>
          <legend className="type-eyebrow text-muted-foreground">About</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('height_cm', 'Height (cm)', { disabled: !self, inputMode: 'numeric', description: 'For coveralls and safety equipment.' })}
            {text('weight_kg', 'Weight (kg)', { disabled: !self, inputMode: 'numeric' })}
            <FormField
              control={form.control}
              name="marital_status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marital status</FormLabel>
                  <FormControl>
                    <OptionalSelect value={field.value} onChange={field.onChange} options={MARITAL_STATUSES} labels={MARITAL_STATUS_LABEL} label="Marital status" disabled={!self} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="has_children"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Children</FormLabel>
                  <FormControl>
                    <OptionalSelect value={field.value} onChange={field.onChange} options={HAS_CHILDREN} labels={HAS_CHILDREN_LABEL} label="Children" disabled={!self} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4" disabled={mutations.saving || !self}>
          <legend className="type-eyebrow text-muted-foreground">Languages</legend>
          <div className="space-y-3">
            {([0, 1, 2, 3] as const).map((i) => {
              const slot = (i + 1) as 1 | 2 | 3 | 4;
              const others = watchedLanguages.filter((_, j) => j !== i).map((l) => l.code).filter(Boolean);
              return (
                <div key={slot} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start">
                  <FormField
                    control={form.control}
                    name={`languages.${i}.code`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{LANGUAGE_SLOT_LABEL[slot]}</FormLabel>
                        <FormControl>
                          <LanguageSelect
                            value={field.value || null}
                            onChange={(code) => {
                              field.onChange(code ?? '');
                              if (!code && i > 0) form.setValue(`languages.${i}.proficiency`, '');
                            }}
                            label={LANGUAGE_SLOT_LABEL[slot]}
                            exclude={others}
                            disabled={!self}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {i > 0 ? (
                    <FormField
                      control={form.control}
                      name={`languages.${i}.proficiency`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="sm:sr-only">Level</FormLabel>
                          <FormControl>
                            <OptionalSelect
                              value={field.value}
                              onChange={field.onChange}
                              options={LANGUAGE_PROFICIENCIES}
                              labels={LANGUAGE_PROFICIENCY_LABEL}
                              label={`${LANGUAGE_SLOT_LABEL[slot]} level`}
                              disabled={!self || !watchedLanguages[i]?.code}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <p className="hidden type-caption text-muted-foreground sm:block sm:pt-8">Spoken from childhood</p>
                  )}
                </div>
              );
            })}
          </div>
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

export default PersonalTab;
