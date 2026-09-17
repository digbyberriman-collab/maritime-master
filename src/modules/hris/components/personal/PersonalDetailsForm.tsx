import React, { useEffect, useMemo } from 'react';
import { useForm, type ControllerRenderProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Briefcase, Contact, FileBadge, Lock, StickyNote, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { RANKS, NATIONALITIES } from '@/modules/crew/constants';
import { LEAVE_DEPARTMENTS } from '@/modules/crew/leaveConstants';
import { CREW_STATUSES, GENDERS } from '@/modules/auth/lib/permissions';
import { HRIS_PATHS } from '@/modules/hris/paths';
import type { HrProfile } from '@/modules/hris/hooks/useHrProfile';
import { expiryLabel, expiryTone, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';
import {
  EMPLOYMENT_STATUSES,
  buildProfilePatch,
  isDateField,
  profileFormSchema,
  profileToFormValues,
  SENSITIVE_PROFILE_FIELDS,
  withStoredOption,
  type ProfileFormField,
  type ProfileFormValues,
} from '@/modules/hris/lib/profileForm';

const NONE = '__none__';

type FieldKind = 'text' | 'tel' | 'date' | 'select' | 'textarea';

interface FieldDef {
  name: ProfileFormField;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  optionLabel?: (value: string) => string;
  placeholder?: string;
  /** Show an expiry badge derived from the date value. */
  expiry?: boolean;
  /** Reason shown when the field is locked in edit mode. */
  lockedReason?: string;
  /** Span the full grid width. */
  wide?: boolean;
}

interface SectionDef {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  fields: FieldDef[];
  aside?: React.ReactNode;
}

export interface PersonalDetailsFormProps {
  profile: HrProfile;
  editing: boolean;
  editableFields: ReadonlySet<ProfileFormField>;
  /** Show passport number / date of birth. */
  showSensitive: boolean;
  saving: boolean;
  /** DOM id so a Save button outside the form can submit it. */
  formId: string;
  onSubmit: (patch: TablesUpdate<'profiles'>, previous: Partial<Record<ProfileFormField, string | null>>) => void | Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

const DEPARTMENTS = LEAVE_DEPARTMENTS.filter((d) => d !== 'All');

export const PersonalDetailsForm: React.FC<PersonalDetailsFormProps> = ({
  profile,
  editing,
  editableFields,
  showSensitive,
  saving,
  formId,
  onSubmit,
  onDirtyChange,
}) => {
  const initial = useMemo(() => profileToFormValues(profile), [profile]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: initial,
    mode: 'onBlur',
  });

  // Re-seed whenever the underlying row changes (crew switch, successful save,
  // avatar update) or edit mode is left.
  useEffect(() => {
    form.reset(initial);
  }, [form, initial, editing]);

  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange(editing && isDirty);
  }, [editing, isDirty, onDirtyChange]);

  const sections = useMemo<SectionDef[]>(
    () => [
      {
        id: 'identity',
        title: 'Identity',
        description: 'Legal name and personal particulars.',
        icon: UserRound,
        fields: [
          { name: 'first_name', label: 'First name', kind: 'text' },
          { name: 'last_name', label: 'Last name', kind: 'text' },
          { name: 'preferred_name', label: 'Preferred name', kind: 'text', placeholder: 'Shown across the app' },
          { name: 'date_of_birth', label: 'Date of birth', kind: 'date' },
          { name: 'gender', label: 'Gender', kind: 'select', options: withStoredOption(GENDERS, profile.gender) },
          { name: 'nationality', label: 'Nationality', kind: 'select', options: withStoredOption(NATIONALITIES, profile.nationality) },
        ],
      },
      {
        id: 'contact',
        title: 'Contact',
        description: 'How to reach this crew member.',
        icon: Contact,
        fields: [
          { name: 'email', label: 'Email', kind: 'text', lockedReason: 'Login email is managed under Users & Access' },
          { name: 'phone', label: 'Phone', kind: 'tel', placeholder: '+00 000 000 000' },
        ],
      },
      {
        id: 'employment',
        title: 'Employment',
        description: 'Role, department and working pattern.',
        icon: Briefcase,
        aside: (
          <Link
            to={`${HRIS_PATHS.contracts}?crew=${profile.id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Contracts & Employment
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        ),
        fields: [
          { name: 'rank', label: 'Rank', kind: 'select', options: withStoredOption(RANKS, profile.rank) },
          { name: 'position', label: 'Position', kind: 'text', placeholder: 'e.g. 2nd Stewardess' },
          { name: 'department', label: 'Department', kind: 'select', options: withStoredOption(DEPARTMENTS, profile.department) },
          { name: 'status', label: 'Crew status', kind: 'select', options: withStoredOption(CREW_STATUSES, profile.status) },
          {
            name: 'employment_status',
            label: 'Employment type',
            kind: 'select',
            options: withStoredOption(EMPLOYMENT_STATUSES, profile.employment_status),
            optionLabel: humanise,
          },
          { name: 'employment_start_date', label: 'Employment start', kind: 'date' },
          { name: 'probation_end_date', label: 'Probation ends', kind: 'date' },
          { name: 'rotation', label: 'Rotation', kind: 'text', placeholder: 'e.g. 10 weeks on / 10 off' },
          { name: 'rotation_pattern', label: 'Rotation pattern', kind: 'text', placeholder: 'e.g. 2:2' },
          { name: 'cabin', label: 'Cabin', kind: 'text' },
          { name: 'contract_start_date', label: 'Contract start', kind: 'date', lockedReason: 'Synced from the active contract' },
          { name: 'contract_end_date', label: 'Contract end', kind: 'date', lockedReason: 'Synced from the active contract', expiry: true },
        ],
      },
      {
        id: 'documents',
        title: 'Documents & compliance',
        description: 'Travel documents and medical fitness.',
        icon: FileBadge,
        fields: [
          { name: 'passport_number', label: 'Passport number', kind: 'text' },
          { name: 'passport_expiry', label: 'Passport expiry', kind: 'date', expiry: true },
          { name: 'visa_status', label: 'Visa status', kind: 'text', placeholder: 'e.g. Schengen C, B1/B2' },
          { name: 'medical_expiry', label: 'Medical (ENG1) expiry', kind: 'date', expiry: true },
        ],
      },
      {
        id: 'notes',
        title: 'Notes',
        description: 'Internal HR notes. Not visible to the crew member unless they hold HR access.',
        icon: StickyNote,
        fields: [{ name: 'notes', label: 'Notes', kind: 'textarea', wide: true }],
      },
    ],
    [profile],
  );

  const submit = form.handleSubmit(async (values) => {
    const patch = buildProfilePatch(initial, values, editableFields);
    const previous: Partial<Record<ProfileFormField, string | null>> = {};
    for (const key of Object.keys(patch) as ProfileFormField[]) {
      previous[key] = initial[key] === '' ? null : initial[key];
    }
    await onSubmit(patch, previous);
  });

  return (
    <Form {...form}>
      <form id={formId} onSubmit={submit} className="space-y-6" noValidate>
        {sections.map((section) => {
          const visibleFields = section.fields.filter((f) => showSensitive || !SENSITIVE_PROFILE_FIELDS.has(f.name));
          if (visibleFields.length === 0) return null;
          const Icon = section.icon;
          return (
            <Card key={section.id} className="bg-card">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {section.title}
                    </CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                  {section.aside}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {visibleFields.map((def) => {
                    const canEdit = editing && editableFields.has(def.name);
                    return (
                      <div key={def.name} className={cn(def.wide && 'sm:col-span-2')}>
                        {canEdit ? (
                          <FormField
                            control={form.control}
                            name={def.name}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{def.label}</FormLabel>
                                {renderControl(def, field, saving)}
                                {def.expiry && field.value && (
                                  <FormDescription>
                                    <ExpiryBadge value={field.value} />
                                  </FormDescription>
                                )}
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <ReadOnlyField
                            def={def}
                            value={initial[def.name]}
                            locked={editing}
                            lockedReason={def.lockedReason ?? (editing ? 'Not editable with your access level' : undefined)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </form>
    </Form>
  );
};

/**
 * Renders the input wrapped in FormControl. For Select the wrapper must sit
 * on the trigger (the DOM element), not the Radix root, so the label and
 * error message ids are wired to something focusable.
 */
function renderControl(def: FieldDef, field: ControllerRenderProps<ProfileFormValues, ProfileFormField>, disabled: boolean) {
  switch (def.kind) {
    case 'select':
      return (
        <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)} disabled={disabled}>
          <FormControl>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            <SelectItem value={NONE}>
              <span className="text-muted-foreground">Not set</span>
            </SelectItem>
            {(def.options ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {def.optionLabel ? def.optionLabel(opt) : opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'textarea':
      return (
        <FormControl>
          <Textarea {...field} rows={5} disabled={disabled} className="bg-background" placeholder={def.placeholder} />
        </FormControl>
      );
    case 'date':
      return (
        <FormControl>
          <Input {...field} type="date" disabled={disabled} className="bg-background" />
        </FormControl>
      );
    case 'tel':
      return (
        <FormControl>
          <Input {...field} type="tel" autoComplete="tel" disabled={disabled} className="bg-background" placeholder={def.placeholder} />
        </FormControl>
      );
    default:
      return (
        <FormControl>
          <Input {...field} type="text" disabled={disabled} className="bg-background" placeholder={def.placeholder} />
        </FormControl>
      );
  }
}

const ExpiryBadge: React.FC<{ value: string }> = ({ value }) => {
  const tone = expiryTone(value);
  return (
    <Badge variant="outline" className={cn('text-[10px] font-normal', toneClass[tone])}>
      {expiryLabel(value)}
    </Badge>
  );
};

interface ReadOnlyFieldProps {
  def: FieldDef;
  value: string;
  /** True while the page is in edit mode but this field is not editable. */
  locked: boolean;
  lockedReason?: string;
}

const ReadOnlyField: React.FC<ReadOnlyFieldProps> = ({ def, value, locked, lockedReason }) => {
  let display: React.ReactNode;
  if (!value) display = <span className="text-muted-foreground">—</span>;
  else if (isDateField(def.name)) display = formatDate(value);
  else if (def.optionLabel) display = def.optionLabel(value);
  else if (def.kind === 'textarea') display = <span className="whitespace-pre-wrap">{value}</span>;
  else display = value;

  return (
    <div className={cn('space-y-1', locked && 'opacity-70')} title={locked ? lockedReason : undefined}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {def.label}
        {locked && <Lock className="h-3 w-3" aria-label={lockedReason} />}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        <span className="break-words">{display}</span>
        {def.expiry && value && <ExpiryBadge value={value} />}
      </div>
    </div>
  );
};

export default PersonalDetailsForm;
