/**
 * The "Vessels shown" filter (gap/02 D1; D-X5-09):
 *
 * - the trigger summarises the selection; the popover edits a draft that
 *   only "Show n vessels" (or Enter) applies, and Escape / Cancel drop;
 * - "All n" is every counted vessel; vessels not counted are listed apart
 *   and never ticked by "All" (D-X5-22); a draft with no vessel cannot be
 *   applied;
 * - the tick helpers (flag, class, fleet group) add their vessels;
 * - keyboard: focus moves into the popover, every control is a native
 *   focusable control in reading order, Escape closes and returns focus;
 * - 390 px: the popover is capped to the viewport less 2 rem, rows truncate
 *   instead of widening it, and rows and controls are 44 px on a coarse
 *   pointer;
 * - tokens only (no palette classes or literals).
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FleetVesselsFilter, VesselChecklist, VesselTickHelpers } from '@/modules/fleet/components/FleetVesselsFilter';
import { toShownVessels, type ShownVesselInput } from '@/modules/fleet/lib/vesselsShown';

beforeAll(() => {
  // Radix measures the anchor and scrolls into view.
  Element.prototype.scrollIntoView = () => undefined;
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const v = (over: Partial<ShownVesselInput> & Pick<ShownVesselInput, 'id' | 'name' | 'code'>): ShownVesselInput => ({ status: 'Active', ...over });

const VESSELS = toShownVessels([
  v({ id: 'v-dra', name: 'DRAAK', code: 'DRA', flag_state: 'Cayman Islands', classification_society: "Lloyd's Register", fleet_group_id: 'g-med' }),
  v({ id: 'v-gam', name: 'GAME CHANGER', code: 'GAM', flag_state: 'Marshall Islands', classification_society: 'DNV' }),
  v({ id: 'v-hyd', name: 'HYDRA', code: 'HYD', flag_state: 'Malta', classification_society: 'DNV', fleet_group_id: 'g-med' }),
  v({ id: 'v-lev', name: 'LEVIATHAN', code: 'LEV', flag_state: 'Malta', classification_society: 'Bureau Veritas' }),
  v({ id: 'v-dem', name: 'DEMO', code: 'DEM', is_counted: false, lifecycle_status: 'active' }),
]);
const COUNTED = ['v-dra', 'v-gam', 'v-hyd', 'v-lev'];
const GROUPS = [{ id: 'g-med', name: 'Mediterranean' }];

function setup(props: Partial<React.ComponentProps<typeof FleetVesselsFilter>> = {}) {
  const onApply = vi.fn();
  const utils = render(
    <FleetVesselsFilter vessels={VESSELS} selectedIds={COUNTED} countedIds={COUNTED} fleetGroups={GROUPS} onApply={onApply} {...props} />,
  );
  const trigger = screen.getByRole('button', { name: /^Vessels shown:/ });
  return { ...utils, onApply, trigger };
}

async function open(trigger: HTMLElement) {
  fireEvent.click(trigger);
  return screen.findByRole('dialog', { name: 'Vessels shown' });
}

const box = (dialog: HTMLElement, name: string | RegExp) => within(dialog).getByRole('checkbox', { name });

describe('trigger', () => {
  it('summarises the selection', () => {
    const { trigger, rerender, onApply } = setup();
    expect(trigger).toHaveAccessibleName('Vessels shown: All 4 counted');
    rerender(<FleetVesselsFilter vessels={VESSELS} selectedIds={['v-hyd', 'v-dra']} countedIds={COUNTED} onApply={onApply} />);
    expect(trigger).toHaveAccessibleName('Vessels shown: 2 of 5 vessels');
    rerender(<FleetVesselsFilter vessels={VESSELS.slice(0, 4)} selectedIds={COUNTED} countedIds={COUNTED} onApply={onApply} />);
    expect(screen.getByRole('button', { name: /^Vessels shown:/ })).toHaveAccessibleName('Vessels shown: All vessels');
  });

  it('is disabled with no vessels', () => {
    render(<FleetVesselsFilter vessels={[]} selectedIds={[]} countedIds={[]} onApply={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Vessels shown: No vessels' })).toBeDisabled();
  });
});

describe('popover', () => {
  it('lists counted vessels, then the ones not counted under their own heading, with the selection ticked', async () => {
    const { trigger } = setup();
    const dialog = await open(trigger);
    const lists = within(dialog).getAllByRole('list');
    expect(within(lists[0]).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual([
      "DRAAKDRACayman Islands · Lloyd's Register",
      'GAME CHANGERGAMMarshall Islands · DNV',
      'HYDRAHYDMalta · DNV',
      'LEVIATHANLEVMalta · Bureau Veritas',
    ]);
    expect(lists[1]).toHaveAccessibleName('Not counted in fleet totals');
    expect(box(dialog, /DEMO/)).not.toBeChecked();
    for (const name of [/DRAAK/, /GAME CHANGER/, /HYDRA/, /LEVIATHAN/]) expect(box(dialog, name)).toBeChecked();
    expect(box(dialog, 'All 4 counted')).toBeChecked();
    expect(within(dialog).getByText('4 of 5 ticked')).toBeInTheDocument();
  });

  it('edits a draft: nothing is applied until "Show n vessels"', async () => {
    const { trigger, onApply } = setup();
    const dialog = await open(trigger);
    fireEvent.click(box(dialog, /GAME CHANGER/));
    fireEvent.click(box(dialog, /DEMO/));
    expect(onApply).not.toHaveBeenCalled();
    expect(box(dialog, 'All 4 counted')).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show 4 vessels' }));
    expect(onApply).toHaveBeenCalledWith(['v-dem', 'v-dra', 'v-hyd', 'v-lev']);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"All" clears and restores every counted vessel; an empty draft cannot be applied', async () => {
    const { trigger, onApply } = setup({ selectedIds: ['v-dem'] });
    const dialog = await open(trigger);
    const all = box(dialog, 'All 4 counted');
    expect(all).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(all);
    expect(all).toBeChecked();
    expect(box(dialog, /DEMO/)).not.toBeChecked();
    fireEvent.click(all);
    expect(all).not.toBeChecked();
    expect(within(dialog).getByText('Tick at least one vessel.')).toBeInTheDocument();
    const show = within(dialog).getByRole('button', { name: 'Show vessels' });
    expect(show).toBeDisabled();
    fireEvent.submit(show.closest('form') as HTMLFormElement);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('Cancel and Escape drop the draft; reopening starts from the applied selection', async () => {
    const { trigger, onApply } = setup();
    let dialog = await open(trigger);
    fireEvent.click(box(dialog, /DRAAK/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    dialog = await open(trigger);
    expect(box(dialog, /DRAAK/)).toBeChecked();
    fireEvent.click(box(dialog, /DRAAK/));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('Enter in the popover applies (the form submits)', async () => {
    const { trigger, onApply } = setup();
    const dialog = await open(trigger);
    fireEvent.click(box(dialog, /LEVIATHAN/));
    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    expect(onApply).toHaveBeenCalledWith(['v-dra', 'v-gam', 'v-hyd']);
  });

  it('tick helpers add the vessels of a flag, a class or a fleet group', async () => {
    const { trigger, onApply } = setup({ selectedIds: ['v-gam'] });
    const dialog = await open(trigger);
    fireEvent.click(box(dialog, 'All 4 counted')); // mixed → all
    fireEvent.click(box(dialog, 'All 4 counted')); // all → none
    const flag = within(dialog).getByRole('combobox', { name: 'Tick the vessels of a flag state' });
    expect(within(flag).getAllByRole('option').map((o) => o.textContent)).toEqual(['Flag', 'Cayman Islands (1)', 'Malta (2)', 'Marshall Islands (1)']);
    fireEvent.change(flag, { target: { value: 'malta' } });
    expect((flag as HTMLSelectElement).value).toBe('');
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Tick the vessels of a fleet group' }), { target: { value: 'g-med' } });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Tick the vessels of a classification society' }), { target: { value: 'dnv' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show 4 vessels' }));
    expect(onApply).toHaveBeenCalledWith(['v-dra', 'v-gam', 'v-hyd', 'v-lev']);
  });

  it('says once which codes of the link were left out', async () => {
    const { trigger } = setup({ droppedCodes: ['XYZ', 'QQQ'] });
    const dialog = await open(trigger);
    expect(within(dialog).getByText(/Not among your vessels, so left out:/)).toHaveTextContent('XYZ, QQQ');
  });

  it('offers a search box for larger fleets and filters the list by name or code', async () => {
    const many = toShownVessels(Array.from({ length: 10 }, (_, i) => v({ id: `v-${i}`, name: `VESSEL ${String.fromCharCode(65 + i)}`, code: `V${i}A` })));
    const ids = many.map((x) => x.id);
    render(<FleetVesselsFilter vessels={many} selectedIds={ids} countedIds={ids} onApply={vi.fn()} />);
    const dialog = await open(screen.getByRole('button', { name: /^Vessels shown:/ }));
    const search = within(dialog).getByRole('searchbox', { name: 'Find a vessel by name or code' });
    await waitFor(() => expect(search).toHaveFocus());
    fireEvent.change(search, { target: { value: 'v3a' } });
    expect(within(dialog).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.closest('label')?.textContent)).toEqual(['All 10', 'VESSEL DV3A']);
    fireEvent.change(search, { target: { value: 'nothing' } });
    expect(within(dialog).getByText('No vessel matches “nothing”.')).toBeInTheDocument();
  });
});

describe('keyboard', () => {
  it('opens from the keyboard, moves focus inside, and walks every control in reading order', async () => {
    const { trigger } = setup();
    trigger.focus();
    // Radix opens on click; a keyboard Enter / Space on a button is a click.
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Vessels shown' });
    // Focus starts on "All" (the search box when there is one), not on the first helper.
    await waitFor(() => expect(box(dialog, 'All 4 counted')).toHaveFocus());
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button, select, input:not([aria-hidden="true"]):not([tabindex="-1"])')).filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0,
    );
    const names = focusables.map((el) => el.getAttribute('aria-label') ?? el.closest('label')?.textContent ?? el.textContent);
    expect(names).toEqual([
      'Tick the vessels of a flag state',
      'Tick the vessels of a classification society',
      'Tick the vessels of a fleet group',
      'All 4 counted',
      "DRAAKDRACayman Islands · Lloyd's Register",
      'GAME CHANGERGAMMarshall Islands · DNV',
      'HYDRAHYDMalta · DNV',
      'LEVIATHANLEVMalta · Bureau Veritas',
      'DEMODEM',
      'Cancel',
      'Show 4 vessels',
    ]);
    // Every checkbox is a real focusable control with a visible focus ring.
    for (const c of within(dialog).getAllByRole('checkbox')) {
      expect(c.tagName).toBe('BUTTON');
      expect(c.className).toMatch(/focus-visible:ring-2/);
    }
    for (const s of within(dialog).getAllByRole('combobox')) expect(s.className).toMatch(/focus-visible:ring-2/);
  });

  it('a label click ticks its vessel (the row is the target, not just the box)', async () => {
    const { trigger } = setup();
    const dialog = await open(trigger);
    const label = within(dialog).getByText('HYDRA').closest('label') as HTMLLabelElement;
    act(() => label.click());
    expect(box(dialog, /HYDRA/)).not.toBeChecked();
  });
});

describe('390 px and touch', () => {
  it('caps the popover to the viewport, truncates rows, and gives rows and selects 44 px on coarse pointers', async () => {
    const { trigger } = setup();
    const dialog = await open(trigger);
    expect(dialog.className).toContain('w-[min(24rem,calc(100vw-2rem))]');
    const form = dialog.querySelector('form') as HTMLFormElement;
    expect(form.className).toContain('max-h-[min(36rem,calc(100dvh-8rem))]');
    for (const label of Array.from(dialog.querySelectorAll('label'))) {
      expect(label.className).toContain('min-w-0');
      expect(label.className).toContain('[@media(pointer:coarse)]:min-h-11');
    }
    for (const name of Array.from(dialog.querySelectorAll('label .font-display'))) expect(name.className).toContain('truncate');
    for (const s of within(dialog).getAllByRole('combobox')) expect(s.className).toContain('[@media(pointer:coarse)]:h-11');
    // The trigger shrinks with its container instead of overflowing it.
    expect(trigger.className).toContain('max-w-full');
    expect(trigger.querySelector('.truncate')).not.toBeNull();
  });

  it('uses tokens only: no palette classes, colour literals or dark: variants', () => {
    for (const file of ['src/modules/fleet/components/FleetVesselsFilter.tsx', 'src/modules/fleet/components/ExpiryBucketSummary.tsx']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, file).not.toMatch(/\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/);
      expect(src, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
      expect(src, file).not.toMatch(/\bdark:/);
    }
  });
});

describe('reusable parts (X5-04B)', () => {
  it('VesselTickHelpers renders nothing when no helper splits the list', () => {
    const one = toShownVessels([v({ id: 'a', name: 'A', code: 'AAA', flag_state: 'Malta' }), v({ id: 'b', name: 'B', code: 'BBB', flag_state: 'Malta' })]);
    const { container } = render(<VesselTickHelpers vessels={one} onTick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('VesselChecklist is controlled', () => {
    const onToggle = vi.fn();
    render(<VesselChecklist vessels={VESSELS} selectedIds={['v-hyd']} onToggle={onToggle} label="Targets" />);
    expect(screen.getByRole('list', { name: 'Targets' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /HYDRA/ })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /DRAAK/ }));
    expect(onToggle).toHaveBeenCalledWith('v-dra');
    expect(screen.getByRole('checkbox', { name: /DRAAK/ })).not.toBeChecked();
  });
});
