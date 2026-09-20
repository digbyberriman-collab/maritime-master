import React from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { PageRow } from '../lib/types';
import { stamp } from '../lib/format';

interface Props {
  fixedPage: PageRow | null;
  reviewing: boolean;
  reviewCount: number;
  canPrepare: boolean;
  isMaster: boolean;
  busy: boolean;
  error: string | null;
  coverage: string;
  onPrepare: () => void;
  onSeal: () => void;
  onCancel: () => void;
}

/** Foot of the sheet: the Master's page review and signature, or the fixed page's attestation. */
const PageReviewFooter: React.FC<Props> = ({ fixedPage, reviewing, reviewCount, canPrepare, isMaster, busy, error, coverage, onPrepare, onSeal, onCancel }) => {
  const [reviewed, setReviewed] = React.useState(false);
  React.useEffect(() => setReviewed(false), [reviewing, fixedPage?.id]);
  return (
    <footer className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
      {fixedPage ? (
        <div>
          <strong>Page {fixedPage.page_number} · Master's page signature</strong>
          <p className="font-serif">{fixedPage.sealed_by_name} · {stamp(fixedPage.sealed_at, true)}</p>
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Page evidence</summary><code className="break-all">{fixedPage.digest}</code></details>
        </div>
      ) : reviewing ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <Checkbox checked={reviewed} disabled={!isMaster} onCheckedChange={(v) => setReviewed(v === true)} aria-label="I have reviewed every line on this page" />
            I have reviewed every line on this page ({reviewCount}).
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={!reviewed || !isMaster || busy} onClick={onSeal}>
              <ShieldCheck className="mr-1 h-4 w-4" /> Master · sign page
            </Button>
            <button type="button" className="text-xs text-primary hover:underline" onClick={onCancel}>Back to all lines</button>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
      ) : canPrepare ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" onClick={onPrepare}><Check className="mr-1 h-4 w-4" /> Review &amp; sign completed page</Button>
          <span className="text-xs text-muted-foreground">Signed lines are grouped for the Master's page review.</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Complete each line, save it, then review and sign beside the entry.</span>
      )}
      <small className="text-[11px] text-muted-foreground">{coverage} · Electronic attestations are reviewed statements, not advanced electronic signatures.</small>
    </footer>
  );
};

export default PageReviewFooter;
