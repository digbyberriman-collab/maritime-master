/**
 * The vessel switcher (gap/10 top bar element 3, IA4, IA23; spec §6.2): a
 * popover anchored to the scope control, opened by its chevron, `g v` or
 * `ShellActions.openVesselSwitcher`. The list itself (./VesselSwitcherPanel,
 * cmdk) is a lazy chunk: it is warmed when the pointer enters, focuses or
 * presses the chevron and whenever the switcher opens, and while it loads
 * the popover shows a small loading row. If the chunk cannot load, the
 * popover says so with Retry and Reload, never an empty list. The page is
 * never reloaded for it on its own (an optional UI chunk,
 * src/app/optionalChunks.ts, D-100); Reload is the user's way through the
 * bounded reload guard when STORM was updated under them.
 *
 * Choosing a vessel goes through `useVesselSwitch()`, which keeps the user's
 * place when it can. The row shows a spinner until the navigation lands; the
 * popover then closes and focus goes back to the chevron. Closing the
 * switcher before then (Esc, a click outside) abandons the switch. Only
 * shown with at least two vessels in reach (the caller checks
 * `useVesselSwitcherAvailable`).
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { cancelPendingVesselSwitch, useVesselSwitch } from '@/app/nav/useVesselSwitch';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useShellSurface } from '@/app/shell/shellUi';
import { createOptionalChunkLoader } from '@/app/optionalChunks';
import { requestChunkRecovery } from '@/app/staleChunkRecovery';
import { FLEET_HOME } from './useFleetTarget';
import type { VesselAlertSummary } from './useVesselAlertSummary';
import { ALL_VESSELS, type SwitcherTarget, type SwitcherVessel } from './vesselSwitcherModel';
import TopBarTooltip from './TopBarTooltip';

export interface VesselSwitcherProps {
  /** The vessel the scope control shows (in scope, else the last one). */
  currentVesselId: string | null;
  /** The shared open-alert summary (one query for the control and the list). */
  alerts: VesselAlertSummary;
  /** The scope control's segments, which the popover is anchored to. */
  children: React.ReactNode;
  className?: string;
}

type PanelModule = typeof import('./VesselSwitcherPanel');

/**
 * The panel is an optional UI chunk (src/app/optionalChunks.ts): one import
 * at a time, shared by the preloads and the lazy component, and a failed
 * import is forgotten so the next try loads again. A failure never reloads
 * the page on its own: a hover, focus or open preload fails silently, and
 * PanelLoadBoundary shows "could not load" with Retry (a new import of the
 * same chunk, which never reloads either) and Reload, which goes through the
 * bounded guard (`requestChunkRecovery`: at most 2 reloads in 60 s, then the
 * recovery panel). After a deploy only Reload can reach the new file.
 */
const panelLoader = createOptionalChunkLoader<PanelModule>(() => import('./VesselSwitcherPanel'));

const newAttempt = (attempt: number) => ({ attempt, Panel: React.lazy(panelLoader.load) });

/** The failure state's buttons: 44 px on touch (D-35); the Button's focus ring, offset from the popover. */
const PANEL_ACTION = 'gap-1.5 ring-offset-popover [@media(pointer:coarse)]:h-11';

class PanelLoadBoundary extends React.Component<{ onRetry: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p role="alert" className="type-body-sm flex items-start gap-2 text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.75} aria-hidden="true" />
          The vessel list could not load. STORM may have been updated.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className={PANEL_ACTION} onClick={this.props.onRetry}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
          <Button variant="outline" size="sm" className={PANEL_ACTION} onClick={() => requestChunkRecovery()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload
          </Button>
        </div>
      </div>
    );
  }
}

const PanelLoading: React.FC = () => (
  <div role="status" className="type-body-sm flex items-center gap-2 px-3 py-3 text-muted-foreground">
    <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
    Loading vessels…
  </div>
);

const VesselSwitcher: React.FC<VesselSwitcherProps> = ({ currentVesselId, alerts, children, className }) => {
  const [open, setOpen] = useShellSurface('vesselSwitcher');
  const { vessels, getVesselCodeById } = useVessel();
  const switchTo = useVesselSwitch();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const pendingRef = React.useRef<string | null>(null);
  const [load, setLoad] = React.useState(() => newAttempt(0));

  const rows = React.useMemo<SwitcherVessel[]>(
    () =>
      vessels.map((v) => ({
        id: v.id,
        name: v.name,
        code: getVesselCodeById(v.id) ?? '',
        imo: v.imo_number,
        fleetGroupId: v.fleet_group_id ?? null,
      })),
    [vessels, getVesselCodeById],
  );

  // Opened by any means (chevron, `g v`, the palette): make sure the list is on its way.
  React.useEffect(() => {
    if (open) panelLoader.preload();
  }, [open]);

  // A selection lands as a navigation: then close, which returns focus to the chevron.
  React.useEffect(() => {
    if (!pendingRef.current) return;
    pendingRef.current = null;
    setPendingId(null);
    setOpen(false);
  }, [location.key, setOpen]);

  const onOpenChange = (next: boolean) => {
    if (!next) {
      // Closed before the switch landed (Esc, a click outside): abandon it.
      if (pendingRef.current) cancelPendingVesselSwitch();
      pendingRef.current = null;
      setPendingId(null);
    }
    setOpen(next);
  };

  const onSelect = (target: SwitcherTarget) => {
    if (target === ALL_VESSELS) {
      if (location.pathname === FLEET_HOME) return onOpenChange(false);
      pendingRef.current = ALL_VESSELS;
      setPendingId(ALL_VESSELS);
      navigate(FLEET_HOME);
      return;
    }
    if (target.id === currentVesselId && location.pathname.startsWith('/v/')) return onOpenChange(false);
    if (!target.code) return;
    pendingRef.current = target.id;
    setPendingId(target.id);
    switchTo({ id: target.id, code: target.code });
  };

  const { Panel, attempt } = load;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div className={className}>
          {children}
          <PopoverTrigger asChild>
            <TopBarTooltip label="Switch vessel" shortcut="G V" suppressed={open}>
              <button
                type="button"
                data-testid={SHELL_TEST_IDS.vesselSwitcherTrigger}
                aria-label="Switch vessel"
                aria-haspopup="dialog"
                aria-keyshortcuts="G V"
                onPointerEnter={panelLoader.preload}
                onPointerDown={panelLoader.preload}
                onFocus={panelLoader.preload}
                className={cn(
                  'inline-flex w-7 shrink-0 items-center justify-center rounded-[calc(var(--radius)-4px)] text-muted-foreground transition-colors duration-quick ease-tide',
                  'hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground [@media(pointer:coarse)]:w-11',
                  // Touch: the hit area reaches the scope control's full 44 px height (D-35).
                  "relative [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:inset-x-0 [@media(pointer:coarse)]:after:-inset-y-[3px] [@media(pointer:coarse)]:after:content-['']",
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                )}
              >
                <ChevronDown
                  className="h-4 w-4 transition-transform duration-quick ease-tide motion-reduce:transition-none [[data-state=open]>&]:rotate-180"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </TopBarTooltip>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        data-testid={SHELL_TEST_IDS.vesselSwitcher}
        aria-label="Switch vessel"
        className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <PanelLoadBoundary key={attempt} onRetry={() => setLoad(newAttempt(attempt + 1))}>
          <React.Suspense fallback={<PanelLoading />}>
            <Panel vessels={rows} currentVesselId={currentVesselId} pendingId={pendingId} alerts={alerts} onSelect={onSelect} />
          </React.Suspense>
        </PanelLoadBoundary>
      </PopoverContent>
    </Popover>
  );
};

export default VesselSwitcher;
