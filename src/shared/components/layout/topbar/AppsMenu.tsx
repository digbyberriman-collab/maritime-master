/**
 * Apps (gap/10 top bar element 4, IA8, D-09; spec §6.3): a popover of the
 * STORM workspaces this user can open, two tiles a row, each with its icon,
 * name and one line of purpose. Hidden while access loads and when the user
 * can open no workspace. Shown from 768 px; on phones the same list sits in
 * the account menu's More group. Each tile opens the workspace's first page
 * the user may open; the workspace the user is in is marked current.
 *
 * Opening it starts keyboard users on the current workspace's tile, else
 * the first (Radix's focus scope skips links and would land on the panel).
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { topBarIconButton } from './styles';
import { useWorkspaceApps } from './useWorkspaceApps';
import TopBarTooltip from './TopBarTooltip';

const AppsMenu: React.FC<{ className?: string }> = ({ className }) => {
  const { ready, apps } = useWorkspaceApps();
  const { pathname } = useLocation();
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLUListElement>(null);
  if (!ready || apps.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TopBarTooltip label="Apps" suppressed={open}>
          <button
            type="button"
            data-testid={SHELL_TEST_IDS.appsTrigger}
            aria-label="Apps"
            className={cn(topBarIconButton, className)}
          >
            <LayoutGrid strokeWidth={1.75} aria-hidden="true" />
          </button>
        </TopBarTooltip>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        data-testid={SHELL_TEST_IDS.appsMenu}
        aria-label="Apps"
        className="w-[min(26rem,calc(100vw-2rem))] p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const list = listRef.current;
          (list?.querySelector<HTMLElement>('[aria-current="true"]') ?? list?.querySelector<HTMLElement>('a,button'))?.focus();
        }}
      >
        <p className="type-eyebrow px-1.5 pb-2 pt-1 text-muted-foreground">Workspaces</p>
        <ul ref={listRef} className="grid grid-cols-1 gap-1 min-[420px]:grid-cols-2">
          {apps.map((app) => {
            const { root } = app;
            const current = pathname === root || pathname.startsWith(`${root}/`);
            return (
              <li key={app.id}>
                <Link
                  to={app.path}
                  onClick={() => setOpen(false)}
                  aria-current={current ? 'true' : undefined}
                  className={cn(
                    'flex min-h-14 items-start gap-3 rounded-md border border-transparent p-2.5 text-left transition-colors duration-quick ease-tide',
                    'hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    current && 'border-primary/40 bg-signal-muted',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted',
                      current ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    <app.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('type-body block font-semibold', current ? 'text-primary' : 'text-foreground')}>{app.label}</span>
                    {app.purpose && <span className="type-caption block text-muted-foreground">{app.purpose}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

export default AppsMenu;
