/**
 * The failure state of a Red Room dialog chunk (D-100; src/app/optionalChunks.ts).
 *
 * The Red Room panel is on the dashboard, in the entry chunk, so its Snooze
 * and Assign task dialogs are optional UI chunks that load on first open. If
 * one cannot load, the person sees a small dialog in its place, never nothing
 * and never a page reload: "The dialog could not load", with both causes
 * ("STORM may have been updated, or the connection dropped.") and Close,
 * Try again and Reload. Try again asks the panel for a new attempt (a fresh
 * `React.lazy` bound to a new `loader.load()`, because a lazy component keeps
 * its rejection; the panel keys this boundary by the attempt, so it starts
 * clean). Reload goes through the bounded guard (`requestChunkRecovery`: at
 * most 2 reloads in 60 s, then the recovery panel); after a deploy only a
 * reload reaches the new file. Nothing here reloads on its own (D-04): the
 * page underneath may hold unsaved input. Modelled on the vessel switcher's
 * PanelLoadBoundary and the palette's load boundary.
 */
import React from 'react';
import { AlertTriangle, RefreshCw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { requestChunkRecovery } from '@/app/staleChunkRecovery';

export interface RedRoomDialogBoundaryProps {
  /** Whether the dialog this boundary stands in for is open. */
  open: boolean;
  /** Close the dialog (the failure state closes with it). */
  onClose: () => void;
  /** Try again: a new import of the same chunk; the caller remounts this boundary with a new key. */
  onRetry: () => void;
  children: React.ReactNode;
}

/** The failure state's buttons: 44 px on touch (D-35); the Button's own focus ring. */
const ACTION = 'gap-1.5 [@media(pointer:coarse)]:h-11';

export class RedRoomDialogBoundary extends React.Component<RedRoomDialogBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { open, onClose, onRetry } = this.props;
    return (
      <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
        <DialogContent data-testid="red-room-dialog-load-error" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 type-title">
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} aria-hidden="true" />
              The dialog could not load
            </DialogTitle>
            <DialogDescription>STORM may have been updated, or the connection dropped.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="outline" className={ACTION} onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" className={ACTION} onClick={onRetry}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
            <Button className={ACTION} onClick={() => requestChunkRecovery()}>
              <RefreshCw aria-hidden="true" />
              Reload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}
