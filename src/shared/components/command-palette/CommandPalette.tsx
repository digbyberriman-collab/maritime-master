/**
 * The command palette dialog (gap/10 IA12, BUILD-PLAN S5), rendered once by
 * `CommandPaletteProvider`. It reads its open state from
 * `useCommandPalette()`.
 *
 * The dialog body (cmdk, the sources, the fuzzy matcher) is a lazy chunk,
 * loaded on the first open or earlier by `preloadCommandPalette()`. Nothing
 * renders before the first open; afterwards the dialog stays mounted so it
 * can animate out. If the chunk cannot load, a small dialog says so, never a
 * blank or a fake list, and names both causes: STORM may have been updated
 * (the old hashed file is gone after a deploy) or the connection dropped. It
 * offers Close, Try again (a new import of the same chunk) and Reload, which
 * goes through the bounded reload guard (`requestChunkRecovery`: at most 2
 * reloads in 60 s, then the recovery panel). A failed Try again never reloads
 * on its own: the page underneath may hold unsaved input (D-04, D-100).
 */
import React, { Suspense, lazy, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PALETTE_TEST_IDS } from '@/app/shell/testIds';
import { requestChunkRecovery } from '@/app/staleChunkRecovery';
import { useCommandPalette, useCommandPaletteInitialQuery } from './context';
import { usePaletteInternals } from './internal';
import { paletteLoader } from './preload';

interface LoadBoundaryProps {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  children: React.ReactNode;
}

class PaletteLoadBoundary extends React.Component<LoadBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { open, onClose, onRetry } = this.props;
    return (
      <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
        <DialogContent data-testid={PALETTE_TEST_IDS.dialog} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 type-title">
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
              Search could not load
            </DialogTitle>
            <DialogDescription>
              STORM may have been updated, or the connection dropped. Reload to get the latest version, or try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
            <Button onClick={() => requestChunkRecovery()}>Reload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}

const newAttempt = (attempt: number) => ({ attempt, Dialog: lazy(paletteLoader.load) });

const CommandPalette: React.FC = () => {
  const { isOpen, open, close } = useCommandPalette();
  const initialQuery = useCommandPaletteInitialQuery();
  const { openerRef } = usePaletteInternals();
  const [opened, setOpened] = useState(false);
  const [load, setLoad] = useState(() => newAttempt(0));
  if (isOpen && !opened) setOpened(true);
  if (!opened) return null;

  const { Dialog: PaletteDialog, attempt } = load;
  return (
    <PaletteLoadBoundary key={attempt} open={isOpen} onClose={close} onRetry={() => setLoad(newAttempt(attempt + 1))}>
      <Suspense fallback={null}>
        <PaletteDialog
          open={isOpen}
          onOpenChange={(next) => (next ? open() : close())}
          initialQuery={initialQuery}
          openerRef={openerRef}
        />
      </Suspense>
    </PaletteLoadBoundary>
  );
};

export default CommandPalette;
