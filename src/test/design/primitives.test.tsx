/**
 * Restyled shadcn primitives (BUILD-PLAN A5; gap/10 DS19, A.4, A.8).
 *
 * Overlays use the scrim token with e3 surfaces, tabs are underlined with a
 * Signal indicator, toasts take their tones from status tokens, fields have
 * the 3:1 `input` border on the `field` fill, and the existing variant names
 * keep working. A static scan keeps raw palette classes out of components/ui.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toast, ToastProvider, ToastTitle, ToastViewport } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { TONES, TONE_SURFACE } from '@/components/ui/tones';
import { ROOT, readRepoFile } from './cssTokens';

const RAW_PALETTE =
  /\b(?:[a-z-]+:)*(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|outline|divide|placeholder)-(?:(?:white|black)\b|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b)/;

const overlayOf = () => document.body.querySelector<HTMLElement>('.bg-scrim');

describe('overlays: scrim token + e3 surface', () => {
  it('dialog', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Close out the permit</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Close out the permit' });
    expect(dialog.className).toContain('bg-popover');
    expect(dialog.className).toContain('shadow-xl');
    expect(dialog.className).not.toMatch(RAW_PALETTE);
    const overlay = overlayOf();
    expect(overlay).not.toBeNull();
    expect(overlay?.className).toContain('backdrop-blur-sm');
    expect(overlay?.className).not.toMatch(/bg-black/);
    expect(within(dialog).getByRole('button', { name: 'Close' }).className).toContain('focus-visible:ring-2');
  });

  it('sheet', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Body</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(sheet.className).toContain('bg-popover');
    expect(sheet.className).toContain('shadow-xl');
    expect(overlayOf()).not.toBeNull();
  });

  it('alert dialog keeps the button variants on its actions', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete draft?</AlertDialogTitle>
          <AlertDialogDescription>It cannot be undone.</AlertDialogDescription>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Delete draft?' });
    expect(dialog.className).toContain('bg-popover');
    expect(dialog.className).toContain('shadow-xl');
    expect(overlayOf()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('text-primary-foreground');
    expect(screen.getByRole('button', { name: 'Keep' }).className).toContain('border-input');
  });

  it('drawer source uses the scrim and e3', () => {
    const drawer = readRepoFile('src/components/ui/drawer.tsx');
    expect(drawer).toContain('bg-scrim backdrop-blur-sm');
    expect(drawer).toContain('bg-popover');
    expect(drawer).toContain('shadow-xl');
    expect(drawer).not.toContain('bg-black');
  });
});

describe('tabs: underline with a Signal indicator', () => {
  it('marks the active tab and draws the indicator', () => {
    render(
      <Tabs defaultValue="open">
        <TabsList aria-label="Permits">
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
        </TabsList>
        <TabsContent value="open">Open permits</TabsContent>
        <TabsContent value="closed">Closed permits</TabsContent>
      </Tabs>,
    );
    const list = screen.getByRole('tablist', { name: 'Permits' });
    expect(list.className).toContain('border-b');
    expect(list.className).not.toContain('bg-muted');
    const active = screen.getByRole('tab', { name: 'Open' });
    expect(active).toHaveAttribute('data-state', 'active');
    expect(active.className).toContain('after:bg-primary');
    expect(active.className).toContain('data-[state=active]:after:scale-x-100');
    expect(active.className).toContain('data-[state=active]:after:shadow-glow-signal');
    expect(active.className).toContain('duration-indicator');
    expect(screen.getByRole('tab', { name: 'Closed' })).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Open permits');
  });

  it('still accepts layout overrides from consumers', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = screen.getByRole('tablist');
    expect(list.className).toContain('grid');
    expect(list.className).not.toContain('inline-flex');
  });
});

describe('toasts: tones from status tokens', () => {
  it.each([
    ['default', 'bg-popover'],
    ['destructive', 'bg-critical-muted'],
    ['success', 'bg-success-muted'],
    ['warning', 'bg-warning-muted'],
    ['info', 'bg-info-muted'],
  ] as const)('%s toast', (variant, surface) => {
    render(
      <ToastProvider>
        <Toast open variant={variant}>
          <ToastTitle>Saved</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const toast = screen.getByText('Saved').closest('li');
    expect(toast?.className).toContain(surface);
    expect(toast?.className).not.toMatch(RAW_PALETTE);
  });

  it('sonner follows the resolved theme and tones each type', () => {
    const sonner = readRepoFile('src/components/ui/sonner.tsx');
    expect(sonner).toContain('resolvedTheme');
    for (const tint of ['bg-success-muted', 'bg-critical-muted', 'bg-warning-muted', 'bg-info-muted']) {
      expect(sonner).toContain(tint);
    }
  });
});

describe('fields: 3:1 border on the field fill', () => {
  it('input, textarea and select trigger', () => {
    render(
      <>
        <Input aria-label="Name" />
        <Textarea aria-label="Notes" />
        <Select>
          <SelectTrigger aria-label="Rank">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
        </Select>
      </>,
    );
    for (const el of [
      screen.getByRole('textbox', { name: 'Name' }),
      screen.getByRole('textbox', { name: 'Notes' }),
      screen.getByRole('combobox', { name: 'Rank' }),
    ]) {
      expect(el.className).toContain('border-input');
      expect(el.className).toContain('bg-field');
      expect(el.className).toContain('focus-visible:ring-2');
    }
  });

  it('a consumer background still wins over the field fill', () => {
    render(<Input aria-label="Search" className="bg-transparent" />);
    const input = screen.getByRole('textbox', { name: 'Search' });
    expect(input.className).toContain('bg-transparent');
    expect(input.className).not.toContain('bg-field');
  });
});

describe('buttons and badges', () => {
  it('keeps every existing button variant and adds signal', () => {
    for (const variant of ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'signal'] as const) {
      expect(buttonVariants({ variant }), variant).not.toMatch(RAW_PALETTE);
    }
    expect(buttonVariants()).toContain('bg-primary text-primary-foreground');
    expect(buttonVariants({ variant: 'signal' })).toContain('shadow-glow-signal');
    expect(buttonVariants({ variant: 'destructive' })).toContain('text-destructive-foreground');
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('focus-visible:ring-ring');
  });

  it('keeps the badge variants and adds one per tone', () => {
    for (const variant of ['default', 'secondary', 'destructive', 'outline'] as const) {
      expect(badgeVariants({ variant }), variant).toBeTruthy();
    }
    expect(badgeVariants()).toContain('bg-primary text-primary-foreground');
    for (const tone of TONES) {
      expect(badgeVariants({ variant: tone })).toContain(TONE_SURFACE[tone].split(' ')[1]);
    }
    render(<Badge variant="role">SSO</Badge>);
    expect(screen.getByText('SSO').className).toContain('font-mono');
  });

  it('alerts take status tones and drop the dark: variant', () => {
    render(<Alert variant="warning">Due soon</Alert>);
    expect(screen.getByRole('alert').className).toContain('bg-warning-muted');
    expect(readRepoFile('src/components/ui/alert.tsx')).not.toContain('dark:');
  });
});

describe('no raw palette in src/components/ui', () => {
  const dir = join(ROOT, 'src/components/ui');
  const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));

  it.each(files)('%s', (file) => {
    const offending = readRepoFile(`src/components/ui/${file}`)
      .split('\n')
      .filter((line) => RAW_PALETTE.test(line));
    expect(offending).toEqual([]);
  });
});
