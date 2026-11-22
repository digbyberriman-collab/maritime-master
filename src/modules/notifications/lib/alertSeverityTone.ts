/**
 * One tone per alert severity, shared by every surface that shows an alert
 * (the header NotificationBell and the Notification Center).
 *
 * - gap/10 DS12 / C5: the same severity gets the same tone on every surface,
 *   so the bell and the Notification Center import this map and cannot drift.
 * - D-34: `--accent` is the neutral hover surface and is never a colour cue,
 *   so no severity uses an accent class.
 * - D-52: text on a tint uses `text-<tone>`, never `<tone>-foreground`.
 *
 * Every class string is written out in full so the Tailwind scanner sees it.
 * src/test/notifications/alertSeverityTone.test.ts pins the map.
 */
import type { AlertSeverity } from '@/modules/alerts/constants';

export type AlertSeverityColor = AlertSeverity;

export interface AlertSeverityToneClasses {
  /** Text in the tone, e.g. a section heading or a row label. */
  text: string;
  /** Low-alpha tint for a row or chip background. */
  tint: string;
  /** Left accent border on a row. */
  borderLeft: string;
  /** Bordered, tinted chip with tone text (icon badge). */
  badge: string;
}

export const ALERT_SEVERITY_TONE: Readonly<Record<AlertSeverityColor, Readonly<AlertSeverityToneClasses>>> = Object.freeze({
  RED: Object.freeze({
    text: 'text-destructive',
    tint: 'bg-destructive/10',
    borderLeft: 'border-l-destructive',
    badge: 'border-destructive/40 bg-destructive/10 text-destructive',
  }),
  ORANGE: Object.freeze({
    text: 'text-orange',
    tint: 'bg-orange/10',
    borderLeft: 'border-l-orange',
    badge: 'border-orange/40 bg-orange/10 text-orange',
  }),
  YELLOW: Object.freeze({
    text: 'text-amber',
    tint: 'bg-amber/10',
    borderLeft: 'border-l-amber',
    badge: 'border-amber/40 bg-amber/10 text-amber',
  }),
  GREEN: Object.freeze({
    text: 'text-success',
    tint: 'bg-success/10',
    borderLeft: 'border-l-success',
    badge: 'border-success/40 bg-success/10 text-success',
  }),
});
