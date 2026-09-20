/**
 * Formatting helpers for the Health & Wellness section. Dates, expiry tone
 * and money follow the HRIS helpers so the two sections read the same; the
 * rest is health specific.
 */
export {
  formatDate,
  formatDateTime,
  daysUntil,
  expiryTone,
  expiryLabel,
  toneClass,
  humanise,
  formatMinor,
  toMinor,
  fromMinor,
  type ExpiryTone,
} from '@/modules/hris/lib/format';

/** Fitness states from the `hw_fitness_status` view. */
export type FitnessState = 'valid' | 'restricted' | 'expiring' | 'expired' | 'unfit' | 'unknown';

export const FITNESS_LABELS: Record<FitnessState, string> = {
  valid: 'Fit for duty',
  restricted: 'Fit with restrictions',
  expiring: 'Expiring soon',
  expired: 'Expired',
  unfit: 'Not fit for duty',
  unknown: 'No certificate',
};

export const FITNESS_TONE: Record<FitnessState, 'good' | 'warning' | 'critical' | 'default'> = {
  valid: 'good',
  restricted: 'warning',
  expiring: 'warning',
  expired: 'critical',
  unfit: 'critical',
  unknown: 'default',
};

export const fitnessStateOf = (value: string | null | undefined): FitnessState =>
  (value && value in FITNESS_LABELS ? value : 'unknown') as FitnessState;

/** Severity wording used across allergies, conditions and referrals. */
export const SEVERITY_TONE: Record<string, 'good' | 'warning' | 'critical' | 'default'> = {
  mild: 'default',
  moderate: 'warning',
  severe: 'critical',
  anaphylaxis: 'critical',
  routine: 'default',
  soon: 'warning',
  urgent: 'critical',
  emergency: 'critical',
};

/** Badge classes for a tone, matching the design tokens in index.css. */
export const badgeToneClass: Record<'good' | 'warning' | 'critical' | 'default', string> = {
  good: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
  default: 'bg-muted text-muted-foreground border-border',
};

/** Height and weight in the unit the company works in. */
export const formatWeight = (kg: number | null | undefined, units: string | null | undefined): string => {
  if (kg === null || kg === undefined) return '—';
  return units === 'imperial' ? `${(kg * 2.20462).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
};

export const formatHeight = (cm: number | null | undefined, units: string | null | undefined): string => {
  if (cm === null || cm === undefined) return '—';
  if (units !== 'imperial') return `${cm.toFixed(0)} cm`;
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  return `${feet}' ${inches}"`;
};

/** Body mass index, or null when either measurement is missing. */
export const bmi = (weightKg: number | null | undefined, heightCm: number | null | undefined): number | null => {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  const value = weightKg / (m * m);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
};

export const bmiBand = (value: number | null): string => {
  if (value === null) return '—';
  if (value < 18.5) return 'Underweight';
  if (value < 25) return 'Healthy';
  if (value < 30) return 'Overweight';
  return 'Obese';
};

/** Minutes as "1h 30m", for treatment durations and session lengths. */
export const formatDuration = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

/** "08:30" from a timestamp, in the browser's timezone. */
export const formatTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/** Macros as "520 kcal · 34P 60C 12F". */
export const formatMacros = (row: {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}): string => {
  const kcal = Math.round(row.calories ?? 0);
  const p = Math.round(row.protein_g ?? 0);
  const c = Math.round(row.carbs_g ?? 0);
  const f = Math.round(row.fat_g ?? 0);
  return `${kcal} kcal · ${p}P ${c}C ${f}F`;
};

/**
 * The calendar day in the browser's timezone as `YYYY-MM-DD`.
 *
 * Everything in this module that stores a day — a food log entry, a spa
 * booking, a scheduled session — stores the day the user was living in, not
 * the UTC day. `toISOString().slice(0, 10)` gets that wrong for most of the
 * planet for part of every day, so nothing here uses it.
 */
export const localDayIso = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** The local calendar day a stored timestamp falls on. */
export const localDayOf = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : localDayIso(d);
};

/**
 * A `<input type="datetime-local">` value for a stored timestamp, in the
 * browser's timezone. The input has no zone designator, so it must be fed and
 * read as local time or every save shifts the record by the UTC offset.
 */
export const toLocalDateTimeInput = (value?: string | Date | null): string => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${localDayIso(d)}T${hh}:${mm}`;
};

/** The stored timestamp for a `datetime-local` value, read as local time. */
export const fromLocalDateTimeInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const todayIso = (): string => localDayIso();

export const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
