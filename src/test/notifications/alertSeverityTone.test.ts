/**
 * One severity → one tone, on every alert surface (gap/10 DS12 / C5).
 *
 * Lane A remapped `--accent` to the neutral hover surface (D-34), so the
 * bell's YELLOW rows and its Upcoming heading, still on `bg-accent/20` /
 * `text-accent-foreground` / `border-l-accent`, read as an inactive grey, and
 * its ORANGE rows used `warning` while the Notification Center used `orange`.
 * Both surfaces now take their classes from ALERT_SEVERITY_TONE.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALERT_SEVERITY_TONE } from '@/modules/notifications/lib/alertSeverityTone';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const BELL = 'src/shared/components/layout/NotificationBell.tsx';
const CENTER = 'src/modules/notifications/pages/NotificationCenterPage.tsx';
const IMPORT = '@/modules/notifications/lib/alertSeverityTone';

describe('ALERT_SEVERITY_TONE', () => {
  it('maps RED, ORANGE, YELLOW, GREEN to destructive, orange, amber, success', () => {
    expect(Object.keys(ALERT_SEVERITY_TONE)).toEqual(['RED', 'ORANGE', 'YELLOW', 'GREEN']);
    const tones = ['destructive', 'orange', 'amber', 'success'];
    Object.values(ALERT_SEVERITY_TONE).forEach((classes, i) => {
      const tone = tones[i];
      expect(classes).toEqual({
        text: `text-${tone}`,
        tint: `bg-${tone}/10`,
        borderLeft: `border-l-${tone}`,
        badge: `border-${tone}/40 bg-${tone}/10 text-${tone}`,
      });
    });
  });

  it('never uses accent as a colour cue (D-34) or <tone>-foreground on a tint (D-52)', () => {
    for (const [severity, classes] of Object.entries(ALERT_SEVERITY_TONE)) {
      for (const cls of Object.values(classes).flatMap((v) => v.split(/\s+/))) {
        expect(cls, `${severity}: ${cls}`).not.toMatch(/accent/);
        expect(cls, `${severity}: ${cls}`).not.toMatch(/-foreground/);
      }
    }
  });

  it('is frozen, so a surface cannot re-tone a severity at runtime', () => {
    expect(Object.isFrozen(ALERT_SEVERITY_TONE)).toBe(true);
    for (const classes of Object.values(ALERT_SEVERITY_TONE)) expect(Object.isFrozen(classes)).toBe(true);
  });
});

describe('alert surfaces share the tone map (gap/10 DS12 / C5)', () => {
  it.each([BELL, CENTER])('%s imports ALERT_SEVERITY_TONE', (file) => {
    const src = read(file);
    expect(src).toContain(`from '${IMPORT}'`);
    expect(src).toMatch(/\bALERT_SEVERITY_TONE\b/);
  });

  it('the bell no longer hard-codes accent or warning severity tones', () => {
    const src = read(BELL);
    for (const cls of ['bg-accent/20', 'border-l-accent', 'text-accent-foreground', 'bg-warning/10', 'border-l-warning']) {
      expect(src, cls).not.toContain(cls);
    }
    // The Upcoming / Overdue section headings follow the row tones too.
    expect(src).not.toMatch(/upcoming:\s*'text-/);
    expect(src).not.toMatch(/overdue:\s*'text-/);
  });

  it('the Notification Center keeps no local severity style table', () => {
    const src = read(CENTER);
    expect(src).not.toMatch(/\bseverityStyle\b/);
    expect(src).toContain('ALERT_SEVERITY_TONE[alert.severity_color].badge');
  });
});
