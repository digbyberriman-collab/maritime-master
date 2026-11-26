import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm, type FieldPath, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle, Anchor, Briefcase, CalendarDays, CheckCircle2, Info, KeyRound, Loader2, UserPlus, UserRound, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PageHeader from '@/shared/components/layout/PageHeader';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { StatusPill } from '@/shared/components/status';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { notify } from '@/shared/lib/notify';
import { todayDateOnly } from '@/shared/lib/form';
import { CREW_CAPS, CREW_PATHS } from '@/modules/crew/paths';
import { PositionPicker, type PositionOption } from '@/modules/crew/components/PositionPicker';
import { usePositions } from '@/modules/crew/hooks/usePositions';
import { useDepartments } from '@/modules/crew/hooks/useReferenceData';
import {
  findDuplicates,
  useAddCrewSave,
  useContractTypes,
  useRehirePrefill,
  useVesselHomePort,
  type AddCrewVessel,
  type ContractTypeOption,
  type DuplicateCheck,
} from '@/modules/crew/hooks/useAddCrew';
import { formatDay } from '@/modules/crew/hooks/useCrewProfile';
import { profilePath } from '@/modules/crew/lib/profileTabs';
import {
  ADD_CREW_ROLES,
  ADD_CREW_ROLE_LABEL,
  DUPLICATE_MATCH_LABEL,
  EMAIL_HELP,
  EMAIL_OPTIONAL,
  LEAVE_METHODS,
  LEAVE_METHOD_LABEL,
  NO_EMAIL_HELP,
  REHIRE_PARAM,
  accessSetPreview,
  addCrewDefaults,
  defaultRoleForPosition,
  deriveJoinStatus,
  duplicateKey,
  duplicatesBlockSave,
  leaveDaysPerMonthText,
  makeAddCrewSchema,
  type AddCrewResult,
  type AddCrewValues,
} from '@/modules/crew/lib/addCrewSchema';
import { ACCESS_SET_LABEL, RANK_TIER_LABEL, type Department, type VesselPosition } from '@/modules/crew/types/domain';

/** Why Save waits for a users-access administrator (create-crew-member asks admin.access.users_access.admin). */
export const ADMIN_NEEDED =
  'Adding a crew member also creates their STORM account, which needs users-access administration on this vessel. You can fill in the form, but only a users-access administrator can save it.';
export const DUPLICATES_UNAVAILABLE = 'The duplicate check arrives with the crew update, so STORM could not look for this person on other crews first.';
export const NOT_SET_UP_NOTICE =
  'Positions, departments and contract types arrive with the crew update. You can still add the person; their employment details are saved once it is applied.';

const NONE = '__none';
const coarse = '[@media(pointer:coarse)]:h-11';

interface RouteVessel extends AddCrewVessel {
  name: string;
}

/**
 * Add crew member (gap/04 C14, C15, C55, W1; X1-03B) at `crew/new` on the
 * vessel (`?rehire=<profileId>` prefills a returning crew member, X1-11B).
 *
 * Gate: vessel.crew.crew_profiles.create on the route vessel (the route
 * guard checks the key too); nothing is read while it loads, AccessDenied
 * when denied. Save also needs admin.access.users_access.admin, because
 * create-crew-member makes the person's account: without it the form is
 * usable but Save explains who can save. A re-hire saves only the
 * employment terms (the person exists), so it needs no account change.
 *
 * Before Save the duplicate check runs (crew_find_duplicates): the same
 * email blocks, the same name asks to confirm. Save is create-crew-member,
 * then crew_onboarding_save; the outcome is said part by part.
 *
 * D-01: without the positions catalogue the position is typed; without the
 * department list or contract types those fields are not offered; without
 * the duplicate check Save says it was skipped; without the terms store the
 * outcome says the employment details were not saved. Any other error is
 * an error with Retry.
 */
const AddCrewPage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const gate = useCapability(CREW_CAPS.profilesCreate, { vesselId: vessel?.id ?? null });
  const [searchParams] = useSearchParams();
  const rehire = searchParams.get(REHIRE_PARAM)?.trim() || null;
  usePageLocationOverride({ title: rehire ? 'Re-hire crew member' : 'Add crew member', crumbs: 'page' });

  if (!vessel) return <PageEmpty title="Choose a vessel" body="Crew members are added to a vessel's crew. Open Add crew from a vessel's crew list." />;
  if (gate.status === 'loading') return <PageLoading variant="detail" label="Checking your access…" />;
  if (!gate.allowed) {
    return (
      <AccessDenied
        title="You can't add crew to this vessel"
        detail="Adding crew needs crew profile creation on this vessel. Ask your fleet manager for it."
      />
    );
  }
  const routeVessel: RouteVessel = { id: vessel.id, companyId: vessel.company_id, name: vessel.name };
  return <AddCrewBody key={`${vessel.id}:${rehire ?? ''}`} vessel={routeVessel} rehire={rehire} />;
};

const AddCrewBody: React.FC<{ vessel: RouteVessel; rehire: string | null }> = ({ vessel, rehire }) => {
  const positions = usePositions(vessel);
  const departments = useDepartments();
  const prefill = useRehirePrefill(vessel, rehire);

  if (positions.status === 'idle' || positions.status === 'loading' || departments.status === 'loading' || prefill.status === 'loading') {
    return <PageLoading variant="detail" label="Loading the form…" />;
  }
  if (positions.status === 'error') {
    return <PageError error={positions.error} onRetry={positions.retry} title="The positions could not load" treatMissingAsOff={false} headingLevel={1} />;
  }
  if (departments.status === 'error') {
    return <PageError error={departments.error} onRetry={departments.retry} title="The departments could not load" treatMissingAsOff={false} headingLevel={1} />;
  }
  if (prefill.status === 'error') {
    return <PageError error={prefill.error} onRetry={prefill.retry} title="This crew member could not load" treatMissingAsOff={false} headingLevel={1} />;
  }
  if (prefill.status === 'not_found') {
    return <AccessDenied title="This crew member can't be shown" detail="They may not exist, or they are not in your company." />;
  }
  return (
    <AddCrewForm
      vessel={vessel}
      positions={positions.status === 'ready' ? positions.positions.filter((p) => p.isListed) : null}
      departments={departments.status === 'ready' ? departments.items : null}
      rehire={prefill.status === 'ready' ? { profileId: prefill.profileId, displayName: prefill.displayName, values: prefill.values } : null}
    />
  );
};

// ---------------------------------------------------------------- the form

type DuplicateState =
  | { status: 'none' }
  | { status: 'checking' }
  | { status: 'done'; key: string; check: DuplicateCheck; confirmed: boolean }
  | { status: 'error'; key: string; error: unknown };

const toOption = (p: VesselPosition): PositionOption => ({
  id: p.positionId,
  name: p.name,
  departmentKey: p.departmentKey,
  departmentLabel: p.departmentLabel,
  departmentSort: p.departmentSort,
  rankTier: p.rankTier,
  sortOrder: p.sortOrder,
  hint: p.holderCount > 0 ? `${p.holderCount} on board` : undefined,
});

const RequiredMark: React.FC = () => (
  <>
    <span aria-hidden="true" className="text-critical">
      {' '}
      *
    </span>
    <span className="sr-only"> (required)</span>
  </>
);

const Section: React.FC<{ icon: LucideIcon; title: string; description?: string; children: React.ReactNode; testId: string }> = ({
  icon: Icon,
  title,
  description,
  children,
  testId,
}) => (
  <Card className="min-w-0" data-add-crew-section={testId}>
    <CardHeader className="flex-row items-start gap-3 space-y-0 pb-4">
      <span aria-hidden="true" className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <CardTitle className="type-subtitle">{title}</CardTitle>
        {description ? <p className="mt-0.5 type-caption text-muted-foreground">{description}</p> : null}
      </div>
    </CardHeader>
    <CardContent className="grid min-w-0 gap-4 sm:grid-cols-2">{children}</CardContent>
  </Card>
);

interface AddCrewFormProps {
  vessel: RouteVessel;
  /** The vessel's listed positions, or null when the catalogue is not set up (D-01). */
  positions: VesselPosition[] | null;
  /** The department list, or null when it is not set up (D-01). */
  departments: readonly Department[] | null;
  rehire: { profileId: string; displayName: string; values: Partial<AddCrewValues> } | null;
}

const AddCrewForm: React.FC<AddCrewFormProps> = ({ vessel, positions, departments, rehire }) => {
  const scopedPath = useScopedPath();
  const ctx = { vesselId: vessel.id };
  const admin = useCapability('admin.access.users_access.admin', ctx);
  const canManagePositions = useCan(CREW_CAPS.complianceAdmin, ctx);
  const contractTypes = useContractTypes(vessel.companyId);
  const homePort = useVesselHomePort(vessel);
  const save = useAddCrewSave(vessel);
  const today = useMemo(() => todayDateOnly(), []);

  const positionsFromCatalogue = positions !== null;
  const departmentsAvailable = departments !== null && departments.length > 0;
  const schema = useMemo(() => makeAddCrewSchema({ positionsFromCatalogue, departmentsAvailable }), [positionsFromCatalogue, departmentsAvailable]);
  const initial = useMemo(() => addCrewDefaults(rehire?.values), [rehire]);
  const form = useForm<AddCrewValues>({ resolver: zodResolver(schema), defaultValues: initial, mode: 'onTouched' });
  const touched = useRef({ department: Boolean(rehire?.values.departmentKey), role: false, port: Boolean(rehire?.values.placeOfEmbarkation) });

  const [duplicates, setDuplicates] = useState<DuplicateState>({ status: 'none' });
  const [failure, setFailure] = useState<Extract<AddCrewResult, { kind: 'not_added' }> | null>(null);
  const [result, setResult] = useState<Exclude<AddCrewResult, { kind: 'not_added' }> | null>(null);
  const [resultName, setResultName] = useState('');
  const [resultNotes, setResultNotes] = useState<string[]>([]);

  const options = useMemo(() => (positions ?? []).map(toOption), [positions]);
  const values = form.watch();
  const position = positions?.find((p) => p.positionId === values.positionId) ?? null;
  const currentKey = duplicateKey(values);
  const dupDone = duplicates.status === 'done' && duplicates.key === currentKey ? duplicates : null;
  const matches = dupDone?.check.status === 'matches' ? dupDone.check.matches : [];
  const blocked = !rehire && dupDone !== null && duplicatesBlockSave(matches, dupDone.confirmed);
  const needsAdmin = !rehire && !admin.allowed;
  const saving = save.isPending || duplicates.status === 'checking';

  // The vessel's home port is the default place of embarkation (W1), unless the field was already filled.
  useEffect(() => {
    if (homePort && !touched.current.port && !form.getValues('placeOfEmbarkation')) {
      form.setValue('placeOfEmbarkation', homePort, { shouldDirty: false });
    }
  }, [homePort, form]);

  const choosePosition = (positionId: string | null) => {
    form.setValue('positionId', positionId ?? '', { shouldValidate: form.formState.isSubmitted, shouldDirty: true });
    const chosen = positions?.find((p) => p.positionId === positionId) ?? null;
    if (chosen && !touched.current.department && departments?.some((d) => d.key === chosen.departmentKey)) {
      form.setValue('departmentKey', chosen.departmentKey, { shouldValidate: form.formState.isSubmitted, shouldDirty: true });
    }
    if (!touched.current.role) form.setValue('role', defaultRoleForPosition(chosen?.key), { shouldDirty: true });
  };

  const submit = form.handleSubmit(async (submitted) => {
    setFailure(null);
    let skippedCheck = false;
    if (!rehire) {
      if (!admin.allowed) return;
      const key = duplicateKey(submitted);
      let check = duplicates.status === 'done' && duplicates.key === key ? duplicates : null;
      if (!check) {
        setDuplicates({ status: 'checking' });
        try {
          const found = await findDuplicates(vessel.id, submitted);
          check = { status: 'done', key, check: found, confirmed: false };
          setDuplicates(check);
        } catch (error) {
          setDuplicates({ status: 'error', key, error });
          return;
        }
        // Possible duplicates: show them and wait for the person to decide.
        if (check.check.status === 'matches') return;
      }
      if (check.check.status === 'matches' && duplicatesBlockSave(check.check.matches, check.confirmed)) return;
      skippedCheck = check.check.status === 'unavailable';
    }
    const outcome = await save.mutateAsync({
      values: submitted,
      context: {
        positionName: position?.name ?? null,
        positionsFromCatalogue,
        departmentsAvailable,
        rehireProfileId: rehire?.profileId ?? null,
      },
    });
    if (outcome.kind === 'not_added') {
      if (outcome.field) {
        form.setError(outcome.field as FieldPath<AddCrewValues>, { message: outcome.message }, { shouldFocus: true });
      } else {
        setFailure(outcome);
      }
      notify.error(outcome.message, { title: outcome.title });
      return;
    }
    const name = rehire?.displayName ?? `${submitted.firstName.trim()} ${submitted.lastName.trim()}`;
    setResultName(name);
    setResultNotes(skippedCheck ? [DUPLICATES_UNAVAILABLE] : []);
    setResult(outcome);
    if (outcome.kind === 'unconfirmed') notify.warning(outcome.title, { description: outcome.message });
    else if (outcome.tone === 'success') notify.success(outcome.title, { description: `${name}. ${outcome.lines[0] ?? ''}`.trim() });
    else notify.warning(outcome.title, { description: outcome.lines[0] });
  });

  const addAnother = () => {
    form.reset(addCrewDefaults({ placeOfEmbarkation: homePort ?? '' }));
    touched.current = { department: false, role: false, port: false };
    setDuplicates({ status: 'none' });
    setFailure(null);
    setResult(null);
    setResultNotes([]);
  };

  const listPath = scopedPath(CREW_PATHS.list);
  const header = (
    <PageHeader
      eyebrow={vessel.name}
      title={rehire ? 'Re-hire crew member' : 'Add crew member'}
      description={
        rehire
          ? `${rehire.displayName} returns to ${vessel.name}. Their documents and history carry over; set the new employment details.`
          : `A new person on ${vessel.name}'s crew: who they are, their position, the employment terms and how they sign in.`
      }
    />
  );

  if (result) {
    return (
      <div className="min-w-0 space-y-4">
        {header}
        <ResultCard
          result={result}
          name={resultName}
          notes={resultNotes}
          profileHref={result.kind === 'added' && result.profileId ? scopedPath(profilePath(result.profileId, 'personal')) : null}
          listHref={listPath}
          onAddAnother={rehire ? null : addAnother}
        />
      </div>
    );
  }

  const joinStatus = deriveJoinStatus(values.startDate, values.joiningDate, today);
  const aboardDay = values.joiningDate.trim() || values.startDate.trim();
  const perMonth = values.leaveMethod === 'days_per_year' ? leaveDaysPerMonthText(values.leaveDaysPerYear) : null;
  const contractLabel = contractTypes.items.find((c) => c.key === values.contractTypeKey)?.label ?? null;
  const departmentLabel = departments?.find((d) => d.key === values.departmentKey)?.label ?? null;

  return (
    <div className="min-w-0 space-y-4" data-add-crew={rehire ? 'rehire' : 'new'}>
      {header}
      {!positionsFromCatalogue ? (
        <Alert variant="info" data-add-crew-notice="not-set-up">
          <Info aria-hidden="true" className="size-4" />
          <AlertDescription>{NOT_SET_UP_NOTICE}</AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <form onSubmit={submit} noValidate aria-label={rehire ? 'Re-hire crew member' : 'Add crew member'} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0 space-y-4">
            <p className="type-caption text-muted-foreground">
              Fields marked <span className="text-critical">*</span> are required.
            </p>

            <Section icon={UserRound} title="Basic details" description={rehire ? 'From their profile. Changed on the profile.' : 'As on their passport.'} testId="basic">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      First name
                      <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" maxLength={60} disabled={Boolean(rehire)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Last name
                      <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" maxLength={60} disabled={Boolean(rehire)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>
                      Email
                      {EMAIL_OPTIONAL ? null : <RequiredMark />}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="email" inputMode="email" autoComplete="off" maxLength={260} disabled={Boolean(rehire)} />
                    </FormControl>
                    <FormDescription>{EMAIL_OPTIONAL ? NO_EMAIL_HELP : EMAIL_HELP}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <Section icon={Briefcase} title="Position and department" description="From this vessel's positions. The department follows the position." testId="position">
              {positionsFromCatalogue ? (
                <FormField
                  control={form.control}
                  name="positionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Position
                        <RequiredMark />
                      </FormLabel>
                      <FormControl>
                        <PositionPicker
                          options={options}
                          value={field.value || null}
                          onChange={(id) => choosePosition(id)}
                          label="Position"
                          emptyText="No position matches. Add it in Positions."
                        />
                      </FormControl>
                      {position ? (
                        <FormDescription>
                          {RANK_TIER_LABEL[position.rankTier]} · {position.departmentLabel}
                        </FormDescription>
                      ) : canManagePositions ? (
                        <FormDescription>
                          Missing one?{' '}
                          <Link className="text-primary underline-offset-4 hover:underline" to={`${listPath}?positions=1`}>
                            Add it in Positions
                          </Link>
                          .
                        </FormDescription>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="positionTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Position
                        <RequiredMark />
                      </FormLabel>
                      <FormControl>
                        <PositionPicker
                          options={[]}
                          value={null}
                          onChange={() => undefined}
                          label="Position"
                          unavailable
                          freeText={field.value}
                          onFreeTextChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {departmentsAvailable ? (
                <FormField
                  control={form.control}
                  name="departmentKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Department
                        <RequiredMark />
                      </FormLabel>
                      <Select
                        value={field.value || undefined}
                        onValueChange={(next) => {
                          touched.current.department = true;
                          field.onChange(next);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger aria-label="Department">
                            <SelectValue placeholder="Choose a department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(departments ?? []).map((d) => (
                            <SelectItem key={d.key} value={d.key}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="space-y-2">
                  <p className="type-body-sm font-medium text-foreground">Department</p>
                  <p className="text-sm text-muted-foreground">The department list arrives with the crew update.</p>
                </div>
              )}
            </Section>

            <Section icon={CalendarDays} title="Employment" description="The agreement on this vessel. The status follows the dates." testId="employment">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Start date
                      <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormDescription>When the contract or agreement starts.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="joiningDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date joining the vessel</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" min={values.startDate || undefined} />
                    </FormControl>
                    <FormDescription>Only when they step aboard after the start date.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2 sm:col-span-2" data-add-crew-status={joinStatus ?? 'unknown'}>
                <p className="type-body-sm font-medium text-foreground">Status</p>
                {joinStatus ? (
                  <p className="flex flex-wrap items-center gap-2 type-body text-muted-foreground">
                    <StatusPill domain="crew_status" status={joinStatus} />
                    {joinStatus === 'pending' ? `Joins on ${formatDay(aboardDay)}.` : 'On board from the start of their employment.'}
                  </p>
                ) : (
                  <p className="type-body text-muted-foreground">On board or Pending, once the start date is set.</p>
                )}
              </div>
              <FormField
                control={form.control}
                name="reviewDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Review date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" min={values.startDate || undefined} />
                    </FormControl>
                    <FormDescription>For the probation or annual review.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ContractTypeField form={form} contractTypes={contractTypes} />
              <fieldset className="min-w-0 space-y-3 sm:col-span-2" data-add-crew-leave="">
                <legend className="type-body-sm font-medium text-foreground">Leave allowance</legend>
                <FormField
                  control={form.control}
                  name="leaveMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-wrap gap-x-6 gap-y-2" aria-label="How leave is earned">
                          {LEAVE_METHODS.map((m) => (
                            <label key={m} className="flex min-h-9 cursor-pointer items-center gap-2 type-body text-foreground [@media(pointer:coarse)]:min-h-11">
                              <RadioGroupItem value={m} />
                              {LEAVE_METHOD_LABEL[m]}
                            </label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
                {values.leaveMethod === 'days_per_year' ? (
                  <FormField
                    control={form.control}
                    name="leaveDaysPerYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Days per year</FormLabel>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <FormControl>
                            <Input {...field} inputMode="decimal" className="w-24" />
                          </FormControl>
                          <span className="type-body text-muted-foreground">days a year</span>
                          {perMonth ? <span className="type-body-sm tabular-nums text-foreground">{perMonth}</span> : null}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
                {values.leaveMethod === 'ratio' ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-start gap-2">
                      <FormField
                        control={form.control}
                        name="leaveRatioOn"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input {...field} inputMode="numeric" className="w-20" aria-label="Time on board" placeholder="On" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <span aria-hidden="true" className="pt-2 type-body text-muted-foreground">
                        :
                      </span>
                      <FormField
                        control={form.control}
                        name="leaveRatioOff"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input {...field} inputMode="numeric" className="w-20" aria-label="Time off" placeholder="Off" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">Time on board to time off, e.g. 2 : 1 for two months on and one off.</p>
                  </div>
                ) : null}
                {values.leaveMethod === 'none' ? <p className="text-sm text-muted-foreground">They earn no paid leave on this vessel.</p> : null}
              </fieldset>
            </Section>

            <Section icon={Anchor} title="Embarkation" description="Where they usually join the vessel." testId="embarkation">
              <FormField
                control={form.control}
                name="placeOfEmbarkation"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Place of embarkation</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={130}
                        onChange={(event) => {
                          touched.current.port = true;
                          field.onChange(event);
                        }}
                      />
                    </FormControl>
                    <FormDescription>{homePort ? `Starts as the vessel's home port, ${homePort}.` : 'A port or city.'}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            {rehire ? null : (
              <Section icon={KeyRound} title="Permissions" description="How they sign in and what STORM lets them do." testId="permissions">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>STORM role</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(next) => {
                          touched.current.role = true;
                          field.onChange(next);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger aria-label="STORM role">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ADD_CREW_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ADD_CREW_ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Follows the position. Admin roles are given in Users &amp; Access.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2" data-add-crew-access-set={position?.defaultAccessSetKey ?? 'none'}>
                  <p className="type-body-sm font-medium text-foreground">Access set</p>
                  <p className="type-body text-foreground">{position ? accessSetPreview(position.defaultAccessSetKey, ACCESS_SET_LABEL) : 'Choose a position'}</p>
                  <p className="text-sm text-muted-foreground">
                    The position&rsquo;s default, shown as a preview. Saving an access set with the person arrives with access sets; until then the role applies.
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="sendInvite"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Send an invitation now" className="mt-0.5" />
                        </FormControl>
                        <div className="min-w-0 space-y-0.5">
                          <FormLabel className="type-body font-medium">Send an invitation now</FormLabel>
                          <FormDescription>
                            {field.value
                              ? 'STORM emails them a link to set their password. They join the vessel once their login is linked.'
                              : 'They are added without a sign-in. Invite them later from the crew list or Users & Access.'}
                          </FormDescription>
                        </div>
                      </div>
                    </FormItem>
                  )}
                />
              </Section>
            )}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-4" aria-label="Summary">
            <Card className="min-w-0" data-add-crew-summary="">
              <CardHeader className="pb-3">
                <CardTitle className="type-subtitle">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="space-y-2.5">
                  <SummaryRow label="Name">{[values.firstName.trim(), values.lastName.trim()].filter(Boolean).join(' ')}</SummaryRow>
                  <SummaryRow label="Position">
                    {position ? `${position.name}${departmentLabel ? ` · ${departmentLabel}` : ''}` : values.positionTitle.trim() || null}
                  </SummaryRow>
                  <SummaryRow label="Status">{joinStatus ? <StatusPill domain="crew_status" status={joinStatus} /> : null}</SummaryRow>
                  <SummaryRow label="Starts">{formatDay(values.startDate)}</SummaryRow>
                  <SummaryRow label="Contract">{contractLabel}</SummaryRow>
                  <SummaryRow label="Leave">
                    {values.leaveMethod === 'days_per_year'
                      ? perMonth
                        ? `${values.leaveDaysPerYear.trim()} days a year`
                        : null
                      : values.leaveMethod === 'ratio'
                        ? values.leaveRatioOn.trim() && values.leaveRatioOff.trim()
                          ? `${values.leaveRatioOn.trim()} : ${values.leaveRatioOff.trim()} rotation`
                          : null
                        : 'None'}
                  </SummaryRow>
                  {rehire ? null : (
                    <>
                      <SummaryRow label="Role">{ADD_CREW_ROLE_LABEL[values.role]}</SummaryRow>
                      <SummaryRow label="Invitation">{values.sendInvite ? 'Sent on save' : 'Not sent'}</SummaryRow>
                    </>
                  )}
                </dl>

                <DuplicatePanel
                  state={duplicates}
                  currentKey={currentKey}
                  profileHref={(id) => scopedPath(profilePath(id, 'personal'))}
                  onConfirm={(confirmed) => setDuplicates((s) => (s.status === 'done' ? { ...s, confirmed } : s))}
                />

                {failure ? (
                  <Alert variant="destructive" data-add-crew-failure="">
                    <AlertTriangle aria-hidden="true" className="size-4" />
                    <AlertTitle>{failure.title}</AlertTitle>
                    <AlertDescription>{failure.message}</AlertDescription>
                  </Alert>
                ) : null}

                {needsAdmin ? (
                  <p className="type-caption text-muted-foreground" data-add-crew-admin={admin.status}>
                    {admin.status === 'loading' ? 'Checking whether you can save…' : ADMIN_NEEDED}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2">
                  <Button type="submit" variant="signal" className={cn('w-full', coarse)} disabled={saving || needsAdmin || blocked}>
                    {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : <UserPlus aria-hidden="true" />}
                    {saving ? (duplicates.status === 'checking' ? 'Checking for duplicates…' : 'Saving…') : rehire ? 'Save employment' : 'Add crew member'}
                  </Button>
                  <Button asChild variant="outline" className={cn('w-full', coarse)}>
                    <Link to={listPath}>Cancel</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </form>
      </Form>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <dt className="shrink-0 type-caption text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words text-right type-body-sm', empty ? 'text-muted-foreground' : 'text-foreground')}>{empty ? '—' : children}</dd>
    </div>
  );
};

const ContractTypeField: React.FC<{
  form: UseFormReturn<AddCrewValues>;
  contractTypes: ReturnType<typeof useContractTypes>;
}> = ({ form, contractTypes }) => {
  if (contractTypes.status === 'missing') {
    return (
      <div className="space-y-2">
        <p className="type-body-sm font-medium text-foreground">Contract type</p>
        <p className="text-sm text-muted-foreground">Contract types arrive with the crew update.</p>
      </div>
    );
  }
  if (contractTypes.status === 'error') {
    return <PageError variant="inline" error={contractTypes.error} onRetry={contractTypes.retry} title="The contract types could not load" treatMissingAsOff={false} />;
  }
  const items: readonly ContractTypeOption[] = contractTypes.items;
  return (
    <FormField
      control={form.control}
      name="contractTypeKey"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Contract type</FormLabel>
          <Select value={field.value || NONE} onValueChange={(next) => field.onChange(next === NONE ? '' : next)} disabled={contractTypes.status === 'loading'}>
            <FormControl>
              <SelectTrigger aria-label="Contract type">
                <SelectValue placeholder={contractTypes.status === 'loading' ? 'Loading…' : 'Not set'} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {items.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

const DuplicatePanel: React.FC<{
  state: DuplicateState;
  currentKey: string;
  profileHref: (profileId: string) => string;
  onConfirm: (confirmed: boolean) => void;
}> = ({ state, currentKey, profileHref, onConfirm }) => {
  if (state.status === 'error' && state.key === currentKey) {
    return (
      <Alert variant="destructive" data-add-crew-duplicates="error">
        <AlertTriangle aria-hidden="true" className="size-4" />
        <AlertTitle>The duplicate check could not run</AlertTitle>
        <AlertDescription>Nothing was added. Try again; if it keeps failing, check the crew list for this person first.</AlertDescription>
      </Alert>
    );
  }
  if (state.status !== 'done' || state.key !== currentKey) return null;
  if (state.check.status === 'unavailable') {
    return (
      <p className="type-caption text-muted-foreground" data-add-crew-duplicates="unavailable">
        {DUPLICATES_UNAVAILABLE}
      </p>
    );
  }
  if (state.check.status === 'clear') return null;
  const { matches } = state.check;
  const emailMatch = matches.find((m) => m.matchKind === 'email');
  return (
    <Alert variant="warning" data-add-crew-duplicates="matches">
      <AlertTriangle aria-hidden="true" className="size-4" />
      <AlertTitle>{matches.length === 1 ? 'This may be someone already in STORM' : `${matches.length} possible matches already in STORM`}</AlertTitle>
      <AlertDescription className="space-y-2">
        <ul className="space-y-1">
          {matches.map((m) => (
            <li key={m.profileId} className="min-w-0 break-words">
              <Link className="font-medium underline underline-offset-4" to={profileHref(m.profileId)}>
                {m.name}
              </Link>
              {` · ${m.vesselName ?? 'not on a vessel'} · ${DUPLICATE_MATCH_LABEL[m.matchKind]}`}
            </li>
          ))}
        </ul>
        {emailMatch ? (
          <p>One email belongs to one person. Use another email, or open {emailMatch.name}&rsquo;s profile.</p>
        ) : (
          <label className="flex cursor-pointer items-start gap-2 [@media(pointer:coarse)]:min-h-11">
            <Checkbox checked={state.confirmed} onCheckedChange={(checked) => onConfirm(checked === true)} className="mt-0.5" />
            <span>This is a different person. Add them anyway.</span>
          </label>
        )}
      </AlertDescription>
    </Alert>
  );
};

const ResultCard: React.FC<{
  result: Exclude<AddCrewResult, { kind: 'not_added' }>;
  name: string;
  /** Extra sentences from the page (a skipped duplicate check). */
  notes: readonly string[];
  profileHref: string | null;
  listHref: string;
  onAddAnother: (() => void) | null;
}> = ({ result, name, notes, profileHref, listHref, onAddAnother }) => {
  const success = result.kind === 'added' && result.tone === 'success';
  const Icon = success ? CheckCircle2 : AlertTriangle;
  const lines = [...(result.kind === 'added' ? result.lines : [result.message]), ...notes];
  return (
    <Card className="min-w-0" data-add-crew-result={result.kind === 'added' ? result.tone : 'unconfirmed'} role="status">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full border',
              success ? 'border-success/25 bg-success-muted text-success' : 'border-warning/25 bg-warning-muted text-warning',
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="type-title text-foreground">{result.title}</h2>
            {name ? <p className="type-body text-muted-foreground">{name}</p> : null}
          </div>
        </div>
        <ul className="space-y-1.5">
          {lines.map((line) => (
            <li key={line} className="type-body text-foreground">
              {line}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {profileHref ? (
            <Button asChild variant="signal" className={coarse}>
              <Link to={profileHref}>
                <UserRound aria-hidden="true" />
                Open the profile
              </Link>
            </Button>
          ) : null}
          {onAddAnother ? (
            <Button type="button" variant="outline" className={coarse} onClick={onAddAnother}>
              <UserPlus aria-hidden="true" />
              Add another crew member
            </Button>
          ) : null}
          <Button asChild variant="ghost" className={coarse}>
            <Link to={listHref}>Back to the crew list</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AddCrewPage;
