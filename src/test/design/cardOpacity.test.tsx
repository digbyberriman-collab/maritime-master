/**
 * Cards are opaque (Phase 1 spec §11.3; gap/10 DS24, A.4 e1).
 *
 * `Card` keeps `bg-card` and always paints an opaque `bg-card` underlay in a
 * `::before` layer at z-index -1, so a caller's translucent tint
 * (`<Card className="bg-primary/5">`, 26 such uses outside the design system)
 * sits on card colour and the shell watermark never shows through. The card
 * itself must not create a stacking context (no `isolate`, no z-index), or
 * the underlay would paint above the card's own background.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CARD_UNDERLAY_CLASSES } from '@/components/ui/card';

const UNDERLAY = [
  'relative',
  'before:pointer-events-none',
  'before:absolute',
  'before:inset-0',
  'before:-z-[1]',
  'before:rounded-[inherit]',
  'before:bg-card',
];

const classesOf = (el: HTMLElement) => el.className.split(/\s+/);

describe('Card opacity', () => {
  it('renders bg-card and the opaque underlay', () => {
    render(<Card data-testid="card">Body</Card>);
    const card = screen.getByTestId('card');
    const classes = classesOf(card);
    expect(classes).toContain('bg-card');
    for (const cls of UNDERLAY) expect(classes, cls).toContain(cls);
  });

  it.each(['bg-primary/5', 'bg-warning/10', 'bg-destructive/5', 'bg-gradient-to-br'])(
    'keeps the underlay when the caller tints the card with %s',
    (tint) => {
      render(
        <Card data-testid="card" className={tint}>
          Body
        </Card>,
      );
      const classes = classesOf(screen.getByTestId('card'));
      expect(classes).toContain(tint);
      for (const cls of UNDERLAY) expect(classes, cls).toContain(cls);
    },
  );

  it('does not create a stacking context of its own (no isolate, no z-index)', () => {
    render(<Card data-testid="card" className="bg-primary/5" />);
    const classes = classesOf(screen.getByTestId('card'));
    expect(classes).not.toContain('isolate');
    expect(classes.filter((c) => /^-?z-/.test(c))).toEqual([]);
  });

  it('lets a caller position the card itself (tailwind-merge keeps the later position)', () => {
    render(<Card data-testid="card" className="sticky top-0" />);
    const classes = classesOf(screen.getByTestId('card'));
    expect(classes).toContain('sticky');
    expect(classes).not.toContain('relative');
    // The underlay still has a containing block: sticky is positioned.
    expect(classes).toContain('before:absolute');
  });

  it('exports the underlay classes as one constant (one source for other opaque surfaces)', () => {
    for (const cls of UNDERLAY) expect(CARD_UNDERLAY_CLASSES.split(/\s+/), cls).toContain(cls);
  });
});
