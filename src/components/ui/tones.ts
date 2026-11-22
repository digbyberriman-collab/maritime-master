/**
 * Status tones (gap/10 §A.8). One meaning per tone, used by `Badge` tone
 * variants, `StatusPill`, `KpiTile` alert bars and `Alert` / toast tones.
 *
 *   ok       done, valid, compliant          (success)
 *   signal   live / in progress              (primary on signal-muted)
 *   info     waiting on the vessel           (info)
 *   purple   waiting on the company          (purple)
 *   warn     attention soon                  (warning)
 *   orange   attention now                   (orange)
 *   danger   failed / overdue / expired      (critical)
 *   neutral  inactive: draft, cancelled      (muted)
 *
 * Every class string is written out in full so Tailwind's scanner finds it.
 * Text on each `-muted` surface passes AA in both themes
 * (src/test/design/contrast.test.ts).
 */

export const TONES = ['ok', 'signal', 'info', 'purple', 'warn', 'orange', 'danger', 'neutral'] as const;
export type Tone = (typeof TONES)[number];

export const isTone = (value: unknown): value is Tone =>
  typeof value === 'string' && (TONES as readonly string[]).includes(value);

/** Tinted pill / badge surface: `{tone}-muted` fill, `{tone}` text, `{tone}` / 25% border. */
export const TONE_SURFACE: Readonly<Record<Tone, string>> = {
  ok: 'border-success/25 bg-success-muted text-success',
  signal: 'border-primary/25 bg-signal-muted text-primary',
  info: 'border-info/25 bg-info-muted text-info',
  purple: 'border-purple/25 bg-purple-muted text-purple',
  warn: 'border-warning/25 bg-warning-muted text-warning',
  orange: 'border-orange/25 bg-orange-muted text-orange',
  danger: 'border-critical/25 bg-critical-muted text-critical',
  neutral: 'border-border bg-muted text-muted-foreground',
};

/** Tone as a text colour (values, labels on cards). */
export const TONE_TEXT: Readonly<Record<Tone, string>> = {
  ok: 'text-success',
  signal: 'text-primary',
  info: 'text-info',
  purple: 'text-purple',
  warn: 'text-warning',
  orange: 'text-orange',
  danger: 'text-critical',
  neutral: 'text-muted-foreground',
};

/** Solid fill for dots, bars and indicators. */
export const TONE_FILL: Readonly<Record<Tone, string>> = {
  ok: 'bg-success',
  signal: 'bg-primary',
  info: 'bg-info',
  purple: 'bg-purple',
  warn: 'bg-warning',
  orange: 'bg-orange',
  danger: 'bg-critical',
  neutral: 'bg-muted-foreground',
};

/** Left alert bar on tiles and rows (3 px, A.9). */
export const TONE_BAR: Readonly<Record<Tone, string>> = {
  ok: 'border-l-success',
  signal: 'border-l-primary',
  info: 'border-l-info',
  purple: 'border-l-purple',
  warn: 'border-l-warning',
  orange: 'border-l-orange',
  danger: 'border-l-critical',
  neutral: 'border-l-border',
};
