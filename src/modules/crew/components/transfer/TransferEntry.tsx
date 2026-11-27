import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  TRANSFER_UNAVAILABLE_NOTICE,
  useTransferDetail,
  useTransferOptions,
  type TransferVessel,
} from '@/modules/crew/hooks/useTransfers';

const TransferWizard = lazy(() => import('./TransferWizard'));

export interface TransferEntryProps {
  open: boolean;
  onClose: () => void;
  vessel: TransferVessel;
  profileId: string;
  personName: string;
  /** Open this transfer (the ?transfer= deep link) instead of the person's options. */
  transferId?: string | null;
  /**
   * The D-01 fallback while the transfer server is not applied: the legacy
   * form (TransferCrewModal's), rendered with the notice. Without it the
   * entry says the transfer is not available yet.
   */
  renderFallback?: (notice: string) => React.ReactNode;
}

const Shell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; busy?: boolean }> = ({ title, onClose, children, busy }) => (
  <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-md" aria-busy={busy ? 'true' : undefined}>
      <DialogHeader className="text-left">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">Transfer between vessels</DialogDescription>
      </DialogHeader>
      {children}
    </DialogContent>
  </Dialog>
);

const Loading: React.FC<{ name: string; onClose: () => void }> = ({ name, onClose }) => (
  <Shell title={`Transfer ${name}`} onClose={onClose} busy>
    <p className="inline-flex items-center gap-2 type-body text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Loading the transfer…
    </p>
  </Shell>
);

/**
 * Where a transfer opens (X1-11): reads the person's options on the route
 * vessel (or one transfer for the deep link) and opens the lazy
 * TransferWizard. States: loading (nothing else shown), blocked (the
 * server's sentence: a pending placement, D-225, or a person outside the
 * caller's reach, D-207), no access, not found, an error with Try again,
 * and D-01 (the transfer RPCs missing): the documented fallback form with
 * the notice.
 */
const TransferEntry: React.FC<TransferEntryProps> = ({ open, onClose, vessel, profileId, personName, transferId = null, renderFallback }) => {
  const byId = Boolean(transferId);
  const options = useTransferOptions(vessel, profileId, open && !byId);
  const detail = useTransferDetail(vessel.companyId, open && byId ? transferId : null);
  if (!open) return null;

  const state = byId ? detail : options;
  if (state.status === 'idle' || state.status === 'loading') return <Loading name={personName} onClose={onClose} />;
  if (state.status === 'missing') {
    if (renderFallback) return <>{renderFallback(TRANSFER_UNAVAILABLE_NOTICE)}</>;
    return (
      <Shell title={`Transfer ${personName}`} onClose={onClose}>
        <Alert variant="info">
          <AlertDescription>Reviewed transfers become available once the crew update is applied. Use the crew list to move this person until then.</AlertDescription>
        </Alert>
      </Shell>
    );
  }
  if (state.status === 'denied' || state.status === 'not_found') {
    return (
      <Shell title={`Transfer ${personName}`} onClose={onClose}>
        <Alert variant="warning" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Shell>
    );
  }
  if (state.status === 'error') {
    return (
      <Shell title={`Transfer ${personName}`} onClose={onClose}>
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={state.retry}>
            Try again
          </Button>
        </div>
      </Shell>
    );
  }

  if (state.status === 'ready' && 'transfer' in state) {
    return (
      <Suspense fallback={<Loading name={personName} onClose={onClose} />}>
        <TransferWizard open onClose={onClose} vessel={vessel} options={null} transfer={state.transfer} personName={state.transfer.personName} />
      </Suspense>
    );
  }
  const ready = state.status === 'ready' && 'options' in state ? state.options : null;
  if (!ready) return <Loading name={personName} onClose={onClose} />;
  if (ready.blocked && !ready.openTransfer) {
    return (
      <Shell title={`Transfer ${ready.person.displayName}`} onClose={onClose}>
        <Alert variant="info" data-transfer-blocked={ready.blocked.code}>
          <AlertDescription>{ready.blocked.message}</AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Shell>
    );
  }
  return (
    <Suspense fallback={<Loading name={personName} onClose={onClose} />}>
      <TransferWizard open onClose={onClose} vessel={vessel} options={ready} transfer={ready.openTransfer} personName={ready.person.displayName} />
    </Suspense>
  );
};

export default TransferEntry;
