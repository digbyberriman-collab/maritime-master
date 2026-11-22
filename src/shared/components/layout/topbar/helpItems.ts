/**
 * What Help offers (gap/10 top bar element 7, IA14; spec §6.5). One list for
 * the Help popover and the account menu's "More" group on phones, so the two
 * never differ. No FAQ list and no unread badge in Phase 1: there is no help
 * or changelog data source yet, and the shell never shows a made-up count.
 */
import { useMemo } from 'react';
import { BookOpen, Keyboard, LifeBuoy, MessageSquareWarning, type LucideIcon } from 'lucide-react';
import { useFeedbackStore } from '@/modules/feedback/store/feedbackStore';
import { useShellActions } from '@/app/shell/shellActions';

export interface HelpItem {
  id: 'guides' | 'support' | 'report' | 'shortcuts';
  label: string;
  description: string;
  icon: LucideIcon;
  /** A page to open, or… */
  to?: string;
  /** …an action. */
  onSelect?: () => void;
}

export function useHelpItems(): HelpItem[] {
  const setPanelOpen = useFeedbackStore((s) => s.setPanelOpen);
  const { openKeyboardShortcuts } = useShellActions();
  return useMemo(() => {
    const items: HelpItem[] = [
      { id: 'guides', label: 'How-to guides', description: 'Step-by-step help for each module', icon: BookOpen, to: '/help/how-to-guides' },
      { id: 'support', label: 'Contact support', description: 'Open a ticket with the STORM team', icon: LifeBuoy, to: '/help/support' },
      {
        id: 'report',
        label: 'Report a problem',
        description: 'Tell us what went wrong on this page',
        icon: MessageSquareWarning,
        onSelect: () => setPanelOpen(true),
      },
    ];
    if (openKeyboardShortcuts) {
      items.push({
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        description: 'Move around STORM without the mouse',
        icon: Keyboard,
        onSelect: openKeyboardShortcuts,
      });
    }
    return items;
  }, [setPanelOpen, openKeyboardShortcuts]);
}
