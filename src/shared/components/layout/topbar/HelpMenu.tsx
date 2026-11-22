/**
 * Help in the top bar (gap/10 top bar element 7, IA14; spec §6.5): guides,
 * support, "Report a problem" and the keyboard shortcuts. Shown from 768 px;
 * on phones the same items sit in the account menu's More group.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useShellSurface } from '@/app/shell/shellUi';
import { topBarIconButton } from './styles';
import { useHelpItems, type HelpItem } from './helpItems';

export interface HelpMenuProps {
  className?: string;
  /** Unread help or changelog items (doc 03). Nothing in Phase 1 sets it: no badge without data. */
  badgeCount?: number;
}

const rowClass =
  'flex min-h-11 w-full items-start gap-3 rounded-sm px-2.5 py-2 text-left text-popover-foreground transition-colors duration-quick ease-tide hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

const HelpMenu: React.FC<HelpMenuProps> = ({ className, badgeCount }) => {
  const [open, setOpen] = useShellSurface('help');
  const items = useHelpItems();
  const badge = typeof badgeCount === 'number' && badgeCount > 0;

  const select = (item: HelpItem) => {
    setOpen(false);
    // After the popover has closed and returned focus, so a dialog it opens keeps focus.
    if (item.onSelect) window.requestAnimationFrame(() => item.onSelect?.());
  };

  const body = (item: HelpItem) => (
    <>
      <item.icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="type-body block font-medium">{item.label}</span>
        <span className="type-caption block text-muted-foreground">{item.description}</span>
      </span>
    </>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={SHELL_TEST_IDS.helpTrigger}
          aria-label={badge ? `Help, ${badgeCount} new` : 'Help'}
          title="Help"
          className={cn(topBarIconButton, 'relative', className)}
        >
          <CircleHelp strokeWidth={1.75} aria-hidden="true" />
          {badge && <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        data-testid={SHELL_TEST_IDS.helpMenu}
        aria-label="Help"
        className="w-[min(20rem,calc(100vw-2rem))] p-1.5"
      >
        <p className="type-eyebrow px-2.5 pb-1 pt-1.5 text-muted-foreground">Help</p>
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              {item.to ? (
                <Link to={item.to} className={rowClass} onClick={() => select(item)}>
                  {body(item)}
                </Link>
              ) : (
                <button type="button" className={rowClass} onClick={() => select(item)}>
                  {body(item)}
                </button>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

export default HelpMenu;
