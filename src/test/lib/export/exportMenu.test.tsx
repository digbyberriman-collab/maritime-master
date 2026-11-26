/**
 * ExportMenu (gap/08 EX1; X5 PR-13): the formats, a run with its toast,
 * disabled with a reason (focusable, described, explained on tap), a single
 * format disabled with its own reason, no double run while busy, a thrown
 * error shown honestly, 44 px targets on a coarse pointer.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error, info: vi.fn(), warning: vi.fn(), dismiss: vi.fn(), promise: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

import { ExportMenu } from '@/shared/components/data/ExportMenu';
import type { ExportFormat, ExportResult } from '@/lib/export';

const OK: ExportResult = { status: 'ok', value: { fileName: 'DRA_CrewList_2026-11-26.csv', rowCount: 3, logged: true, jobId: 'j1' } };
const REFUSED: ExportResult = {
  status: 'refused',
  code: 'export_log_missing',
  message: 'Exports that contain personal data are unavailable until the export log is set up',
};

beforeAll(() => {
  // jsdom has no PointerEvent; without one fireEvent drops `button`, and Radix menus open on pointerdown.
  if (!window.PointerEvent) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  h.success.mockReset();
  h.error.mockReset();
});

/** Radix menus open on pointerdown (button 0); items select on click. */
const press = (el: HTMLElement) => fireEvent.pointerDown(el, { button: 0, ctrlKey: false });
const openMenu = async () => {
  press(screen.getByRole('button', { name: /Export/ }));
  await screen.findByRole('menu');
  return { click: async (el: HTMLElement) => void fireEvent.click(el) };
};

describe('ExportMenu', () => {
  it('offers CSV, Excel and PDF; choosing one runs it and shows the file name', async () => {
    const onExport = vi.fn(async (_format: ExportFormat) => OK);
    render(<ExportMenu onExport={onExport} />);
    const user = await openMenu();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.getAttribute('data-export-format'))).toEqual(['csv', 'xlsx', 'pdf']);
    expect(items.map((i) => i.textContent)).toEqual(['CSV', 'Excel (.xlsx)', 'PDF']);
    for (const item of items) expect(item.className).toContain('[@media(pointer:coarse)]:min-h-11');
    await user.click(screen.getByRole('menuitem', { name: 'Excel (.xlsx)' }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith('xlsx'));
    await waitFor(() => expect(h.success).toHaveBeenCalledWith('Export downloaded', { description: OK.status === 'ok' ? OK.value.fileName : '' }));
    expect(h.error).not.toHaveBeenCalled();
  });

  it('a refusal shows its sentence, never a success', async () => {
    const onResult = vi.fn();
    render(<ExportMenu onExport={async () => REFUSED} onResult={onResult} formats={['csv']} />);
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith('Export not made', { description: REFUSED.status === 'refused' ? REFUSED.message : '' }));
    expect(h.success).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(REFUSED);
  });

  it('a thrown error is shown as an error', async () => {
    render(
      <ExportMenu
        onExport={async () => {
          throw new Error('Network down');
        }}
        formats={['pdf']}
      />,
    );
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'PDF' }));
    await waitFor(() => expect(h.error).toHaveBeenCalledTimes(1));
    expect(h.error.mock.calls[0][0]).toBe('Export not made');
    expect(h.success).not.toHaveBeenCalled();
  });

  it('notifyResult={false} leaves the toast to the caller', async () => {
    const onResult = vi.fn();
    render(<ExportMenu onExport={async () => OK} onResult={onResult} notifyResult={false} formats={['csv']} />);
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(OK));
    expect(h.success).not.toHaveBeenCalled();
  });

  it('disabled with a reason: focusable, described by the reason, no menu, the reason on tap', async () => {
    const onExport = vi.fn(async () => OK);
    render(<ExportMenu onExport={onExport} disabledReason="Available once the list has loaded" />);
    const trigger = screen.getByRole('button', { name: /Export/ });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAccessibleDescription('Available once the list has loaded');
    trigger.focus();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onExport).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Available once the list has loaded'));
  });

  it('a single format disabled with its own reason, shown under it', async () => {
    const onExport = vi.fn(async () => OK);
    render(<ExportMenu onExport={onExport} formatDisabledReasons={{ pdf: 'PDF holds up to 500 rows' }} />);
    const user = await openMenu();
    const pdf = screen.getByRole('menuitem', { name: /PDF/ });
    expect(pdf).toHaveAttribute('data-disabled');
    expect(pdf).toHaveTextContent('PDF holds up to 500 rows');
    fireEvent.click(pdf);
    expect(onExport).not.toHaveBeenCalled();
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith('csv'));
  });

  it('while a file is being made the trigger says so and a second run does nothing', async () => {
    let finish: (r: ExportResult) => void = () => undefined;
    const onExport = vi.fn(() => new Promise<ExportResult>((resolve) => (finish = resolve)));
    render(<ExportMenu onExport={onExport} formats={['csv']} />);
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    const trigger = await screen.findByRole('button', { name: /Exporting/ });
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    press(trigger);
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onExport).toHaveBeenCalledTimes(1);
    await act(async () => finish(OK));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Export$/ })).not.toHaveAttribute('aria-busy'));
    expect(h.success).toHaveBeenCalledTimes(1);
  });
});
