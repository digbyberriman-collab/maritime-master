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
import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { TONES, TONE_SURFACE } from '@/components/ui/tones';
import { ROOT, readRepoFile } from './cssTokens';

const RAW_PALETTE =
  /\b(?:[a-z-]+:)*(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|outline|divide|placeholder)-(?:(?:white|black)\b|(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b)/;

const overlayOf = () => document.body.querySelector<HTMLElement>('.bg-scrim');

beforeAll(() => {
  // Radix popper / cmdk measure and scroll; jsdom implements neither.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (typeof globalThis.DOMRect === 'undefined') {
    // The context menu anchors on a DOMRect built from the pointer position.
    globalThis.DOMRect = class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
      get top() {
        return this.y;
      }
      get left() {
        return this.x;
      }
      get right() {
        return this.x + this.width;
      }
      get bottom() {
        return this.y + this.height;
      }
      toJSON() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
      }
      static fromRect(rect: { x?: number; y?: number; width?: number; height?: number } = {}) {
        return new this(rect.x, rect.y, rect.width, rect.height);
      }
    } as unknown as typeof DOMRect;
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

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
    // Hairline as an inset shadow (no border-b), so the clipped list keeps its indicator.
    expect(list.className).toContain('shadow-[inset_0_-1px_0_0_hsl(var(--border))]');
    expect(list.className).not.toMatch(/(?:^|\s)border-b(?:\s|$)/);
    expect(list.className).not.toContain('bg-muted');
    const active = screen.getByRole('tab', { name: 'Open' });
    expect(active).toHaveAttribute('data-state', 'active');
    expect(active.className).toContain('after:bg-primary');
    expect(active.className).toContain('after:bottom-0');
    expect(active.className).not.toContain('after:-bottom-px');
    expect(active.className).toContain('data-[state=active]:after:scale-x-100');
    expect(active.className).toContain('data-[state=active]:after:shadow-glow-signal');
    expect(active.className).toContain('duration-indicator');
    expect(screen.getByRole('tab', { name: 'Closed' })).toHaveAttribute('data-state', 'inactive');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Open permits');
  });

  it('a horizontal list scrolls inside itself instead of widening the page (390 px)', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Crew">
          {['List', 'Rotations', 'Certificates', 'Leave', 'Training', 'Medical'].map((t) => (
            <TabsTrigger key={t} value={t}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>,
    );
    const list = screen.getByRole('tablist', { name: 'Crew' });
    for (const cls of ['max-w-full', 'overflow-x-auto', 'overflow-y-hidden', 'overscroll-x-contain', '[scrollbar-width:none]', '[&::-webkit-scrollbar]:hidden']) {
      expect(list.className, cls).toContain(cls);
    }
    // Vertical lists keep their visible overflow and natural width.
    expect(list.className).toContain('data-[orientation=vertical]:overflow-visible');
    expect(list.className).toContain('data-[orientation=vertical]:max-w-none');
    for (const tab of screen.getAllByRole('tab')) expect(tab.className).toContain('shrink-0');
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

/*
 * Highlighted / selected options in menus, selects and the command list
 * (WCAG 1.4.11, 2.4.7; gap/10 A.5). The signal-muted fill is ~1.1:1 against
 * the popover in Abyss, so the 2px primary bar is the cue that meets 3:1
 * (contrast.test.ts: primary on popover). A token or class change must not
 * silently drop it.
 */
const PRIMARY_BAR = (variant: string) =>
  new RegExp(`(?:^|\\s)${variant.replace(/[[\]=]/g, '\\$&')}:shadow-\\[inset_[^\\s]*hsl\\(var\\(--primary\\)\\)\\](?:\\s|$)`);

const expectHighlightCue = (el: HTMLElement, variant = 'data-[highlighted]') => {
  expect(el.className).toMatch(PRIMARY_BAR(variant));
  expect(el.className).toContain(`${variant}:bg-signal-muted`);
  expect(el.className).not.toContain('focus:bg-accent');
};

describe('menus, selects and the command list: a visible highlight', () => {
  it('dropdown menu item, checkbox item, radio item and sub-trigger', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Duplicate</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>Pinned</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="all">
            <DropdownMenuRadioItem value="all">All vessels</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expectHighlightCue(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expectHighlightCue(screen.getByRole('menuitemcheckbox', { name: 'Pinned' }));
    expectHighlightCue(screen.getByRole('menuitemradio', { name: 'All vessels' }));
    const sub = screen.getByRole('menuitem', { name: 'Move to' });
    expectHighlightCue(sub);
    // An open sub-menu keeps its parent marked, with the same bar.
    expect(sub.className).toMatch(PRIMARY_BAR('data-[state=open]'));
  });

  it("a destructive item's own focus colour still wins over the highlight text", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem className="text-destructive focus:text-destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const item = screen.getByRole('menuitem', { name: 'Delete' });
    expect(item.className).toContain('focus:text-destructive');
    expect(item.className).not.toContain('focus:text-foreground');
    expectHighlightCue(item);
  });

  it('context menu item, checkbox item, radio item and sub-trigger', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Row</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Open</ContextMenuItem>
          <ContextMenuCheckboxItem checked>Flagged</ContextMenuCheckboxItem>
          <ContextMenuRadioGroup value="open">
            <ContextMenuRadioItem value="open">Open only</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Assign</ContextMenuSubTrigger>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Row'));
    expectHighlightCue(screen.getByRole('menuitem', { name: 'Open' }));
    expectHighlightCue(screen.getByRole('menuitemcheckbox', { name: 'Flagged' }));
    expectHighlightCue(screen.getByRole('menuitemradio', { name: 'Open only' }));
    const sub = screen.getByRole('menuitem', { name: 'Assign' });
    expectHighlightCue(sub);
    expect(sub.className).toMatch(PRIMARY_BAR('data-[state=open]'));
  });

  it('menubar trigger, item, checkbox item, radio item and sub-trigger', () => {
    render(
      <Menubar value="file">
        <MenubarMenu value="file">
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Export</MenubarItem>
            <MenubarCheckboxItem checked>Autosave</MenubarCheckboxItem>
            <MenubarRadioGroup value="a4">
              <MenubarRadioItem value="a4">A4</MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSub>
              <MenubarSubTrigger>Recent</MenubarSubTrigger>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>,
    );
    const trigger = screen.getByRole('menuitem', { name: 'File' });
    expectHighlightCue(trigger);
    expect(trigger.className).toMatch(PRIMARY_BAR('data-[state=open]'));
    expectHighlightCue(screen.getByRole('menuitem', { name: 'Export' }));
    expectHighlightCue(screen.getByRole('menuitemcheckbox', { name: 'Autosave' }));
    expectHighlightCue(screen.getByRole('menuitemradio', { name: 'A4' }));
    const sub = screen.getByRole('menuitem', { name: 'Recent' });
    expectHighlightCue(sub);
    expect(sub.className).toMatch(PRIMARY_BAR('data-[state=open]'));
  });

  it('select option', () => {
    render(
      <Select open value="master">
        <SelectTrigger aria-label="Rank">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="master">Master</SelectItem>
          <SelectItem value="bosun">Bosun</SelectItem>
        </SelectContent>
      </Select>,
    );
    expectHighlightCue(screen.getByRole('option', { name: 'Bosun' }));
  });

  it('command item (cmdk marks the active option data-selected)', () => {
    render(
      <Command label="Jump to">
        <CommandList>
          <CommandItem>Certificates</CommandItem>
          <CommandItem>Drills</CommandItem>
        </CommandList>
      </Command>,
    );
    const item = screen.getByRole('option', { name: 'Certificates' });
    expectHighlightCue(item, 'data-[selected=true]');
    expect(item.className).toContain('data-[selected=true]:text-foreground');
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

  it('input, select trigger and button take their height from the density token (A.7)', () => {
    render(
      <>
        <Input aria-label="Callsign" />
        <Select>
          <SelectTrigger aria-label="Flag">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
        </Select>
        <Button>Save</Button>
        <Button size="icon" aria-label="Add" />
      </>,
    );
    const TOKEN = 'h-[var(--control-h)]';
    expect(screen.getByRole('textbox', { name: 'Callsign' }).className).toContain(TOKEN);
    expect(screen.getByRole('combobox', { name: 'Flag' }).className).toContain(TOKEN);
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain(TOKEN);
    const icon = screen.getByRole('button', { name: 'Add' }).className;
    expect(icon).toContain(TOKEN);
    expect(icon).toContain('w-[var(--control-h)]');
    for (const el of [screen.getByRole('textbox', { name: 'Callsign' }), screen.getByRole('combobox', { name: 'Flag' }), screen.getByRole('button', { name: 'Save' })]) {
      expect(el.className).not.toMatch(/(?:^|\s)(?:md:)?h-(?:9|10)(?:\s|$)/);
    }
    // sm and lg stay fixed secondary sizes; a consumer height still replaces the token.
    expect(buttonVariants({ size: 'sm' })).not.toContain(TOKEN);
    expect(buttonVariants({ size: 'lg' })).not.toContain(TOKEN);
    render(<Button className="h-7">Clear</Button>);
    expect(screen.getByRole('button', { name: 'Clear' }).className).not.toContain(TOKEN);
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
