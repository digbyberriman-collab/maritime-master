import React from 'react';
import { Download, FileText, Loader2, MailPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROW_BUTTON } from './CrewTable';

interface CrewBulkBarProps {
  selectedCount: number;
  /** Selected people who can be invited or sent the invitation again. */
  invitableCount: number;
  canExport: boolean;
  canInvite: boolean;
  exporting: boolean;
  inviting: boolean;
  onExport: () => void;
  onInvite: () => void;
  onReport: () => void;
  onClear: () => void;
}

/**
 * The bulk actions for the selected rows (gap/04 C8): Export CSV, Invite
 * (bulk-invite, only the people who can be invited) and the Crew list
 * report. Each is shown only when the viewer may use it; a busy action
 * says so.
 */
export const CrewBulkBar: React.FC<CrewBulkBarProps> = ({
  selectedCount,
  invitableCount,
  canExport,
  canInvite,
  exporting,
  inviting,
  onExport,
  onInvite,
  onReport,
  onClear,
}) => {
  if (selectedCount === 0) return null;
  return (
    <div
      role="region"
      aria-label="Selected crew"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-signal/40 bg-signal-muted px-3 py-2"
      data-crew-bulk-bar=""
    >
      <span className="type-body-sm font-medium text-foreground" aria-live="polite">
        {selectedCount} selected
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {canExport ? (
          <Button type="button" variant="outline" size="sm" className={ROW_BUTTON} onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        ) : null}
        {canInvite ? (
          <Button type="button" variant="outline" size="sm" className={ROW_BUTTON} onClick={onInvite} disabled={inviting || invitableCount === 0}>
            {inviting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <MailPlus aria-hidden="true" />}
            {invitableCount === 0 ? 'Nobody selected to invite' : `Invite (${invitableCount})`}
          </Button>
        ) : null}
        {canExport ? (
          <Button type="button" variant="outline" size="sm" className={ROW_BUTTON} onClick={onReport}>
            <FileText aria-hidden="true" />
            Crew list report
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" className={ROW_BUTTON} onClick={onClear} aria-label="Clear the selection">
          <X aria-hidden="true" />
          <span className="max-sm:sr-only">Clear</span>
        </Button>
      </div>
    </div>
  );
};

export default CrewBulkBar;
