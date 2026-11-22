/**
 * The keyboard shortcuts dialog (gap/10 improvement 12; spec §6.6). It lists
 * only the shortcuts that act for this user right now, so it never promises
 * a dead key (D-04): `g f` with fleet reach, `g v` when the vessel switcher
 * is offered, ⌘/Ctrl+B with a static sidebar, ⌘K when the palette is there.
 * Keys are shown for this platform (⌘ on Apple, Ctrl elsewhere).
 */
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isApplePlatform, type KeyboardShortcut } from '@/app/shell/keyboard';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useShellSurface } from '@/app/shell/shellUi';
import { useLiveShortcuts } from './useLiveShortcuts';

/** Two-key sequences ("G then V"); every other entry is a chord ("⌘ K"). */
const SEQUENCES: ReadonlySet<KeyboardShortcut['id']> = new Set<KeyboardShortcut['id']>(['vessel-switcher', 'fleet']);

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="type-mono inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-border bg-muted px-1.5 text-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
    {children}
  </kbd>
);

const KeyboardShortcutsDialog: React.FC = () => {
  const [open, setOpen] = useShellSurface('keyboardShortcuts');
  const shortcuts = useLiveShortcuts();
  const apple = isApplePlatform();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-testid={SHELL_TEST_IDS.keyboardShortcuts} className="w-[min(28rem,calc(100vw-2rem))] gap-3">
        <DialogHeader>
          <DialogTitle className="type-title">Keyboard shortcuts</DialogTitle>
          <DialogDescription>Shortcuts work anywhere in STORM except while you are typing in a field.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-border rounded-md border border-border">
          {shortcuts.map((shortcut) => {
            const keys = apple ? shortcut.keys.mac : shortcut.keys.other;
            const sequence = SEQUENCES.has(shortcut.id);
            return (
              <div key={shortcut.id} className="flex min-h-11 items-center justify-between gap-4 px-3 py-2">
                <dt className="type-body min-w-0 text-foreground">{shortcut.label}</dt>
                <dd className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  {keys.map((key, index) => (
                    <React.Fragment key={`${key}-${index}`}>
                      {index > 0 && (sequence || !apple) && (
                        <span className="type-caption px-0.5">{sequence ? 'then' : '+'}</span>
                      )}
                      <Key>{key}</Key>
                    </React.Fragment>
                  ))}
                </dd>
              </div>
            );
          })}
        </dl>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsDialog;
