/**
 * "Viewing as <role> · End" above the top bar while impersonating (gap/10
 * IA25, top bar element 9; spec §6.7). The top bar turns warning-muted at the
 * same time, so the state is visible however far the page has scrolled.
 */
import React from 'react';
import { Eye } from 'lucide-react';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

export interface ImpersonationBarProps {
  targetLabel: string;
  onEnd: () => void;
}

const ImpersonationBar: React.FC<ImpersonationBarProps> = ({ targetLabel, onEnd }) => (
  <div
    role="status"
    data-testid={SHELL_TEST_IDS.impersonationBar}
    className="flex min-w-0 items-center justify-center gap-2 border-b border-warning/25 bg-warning-muted px-3 text-warning"
  >
    <Eye className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
    <p className="type-body-sm min-w-0 truncate">
      Viewing as <span className="font-semibold">{targetLabel}</span>
    </p>
    <span aria-hidden="true">·</span>
    <button
      type="button"
      onClick={onEnd}
      className="type-body-sm min-h-8 shrink-0 rounded-sm px-1.5 font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning [@media(pointer:coarse)]:min-h-11"
    >
      End
    </button>
  </div>
);

export default ImpersonationBar;
