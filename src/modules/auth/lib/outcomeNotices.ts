/**
 * Shows an access-action outcome (invite, resend, bulk invite, password
 * reset, access on / off) as a toast through `notify` (D-05), with Retry
 * when trying again may work. The copy comes from
 * `services/adminActions.ts` (`inviteNotice`, `bulkInviteNotice`, …), so a
 * success toast only ever follows an answer that said it worked.
 */
import { notify } from '@/shared/lib/notify';
import type { OutcomeNotice } from '../services/adminActions';

export interface ShowNoticeOptions {
  /** Offered as "Retry" when the notice says retrying may help. */
  onRetry?: () => void;
  /** Reuse to replace an earlier toast for the same person and action. */
  id?: string;
}

export function showOutcomeNotice(notice: OutcomeNotice, options: ShowNoticeOptions = {}): void {
  const action = notice.retry && options.onRetry ? { label: 'Retry', onClick: options.onRetry } : undefined;
  const common = { ...(options.id ? { id: options.id } : {}), ...(action ? { action } : {}) };
  if (notice.tone === 'success') {
    notify.success(notice.title, { ...common, ...(notice.description ? { description: notice.description } : {}) });
  } else if (notice.tone === 'warning') {
    notify.warning(notice.title, { ...common, ...(notice.description ? { description: notice.description } : {}) });
  } else {
    // The description is already STORM copy; notify.error shows it under the title.
    if (notice.description) notify.error(notice.description, { ...common, title: notice.title });
    else notify.error(notice.title, common);
  }
}
