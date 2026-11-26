/**
 * The one export menu (gap/08 EX1; X5 PR-13; platform-prep PP4).
 *
 *   <ExportMenu
 *     onExport={(format) => runExport({ format, kind: 'Crew list', sourceKey: 'crew.crew_list', personalData: true, columns, rows, vesselId, vesselCode })}
 *     disabledReason={isLoading ? 'Available once the list has loaded' : null}
 *   />
 *
 * - One trigger, "Export", opening the formats (CSV, Excel, PDF by default).
 * - Disabled with a reason, never silently: the trigger stays focusable
 *   (`aria-disabled`), says why in a tooltip on hover, focus or tap, and
 *   carries the reason as its accessible description. A single format can be
 *   disabled with its own reason, shown under it in the menu.
 * - While a file is being made the trigger reads "Exporting…" and a second
 *   click does nothing.
 * - The answer is shown with `notify()` (`notifyExportResult`): the file name
 *   on success, the refusal sentence otherwise. Never a success toast for a
 *   file that was not made.
 * - 44 px targets on a coarse pointer; tokens only.
 *
 * The engine (`@/lib/export`) is imported statically here, but its
 * builders and their libraries load only when a format is chosen.
 */
import { useId, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EXPORT_FORMATS, EXPORT_FORMAT_LABELS, notifyExportResult, type ExportFormat, type ExportResult } from '@/lib/export';
import { cn } from '@/lib/utils';
import { notify } from '@/shared/lib/notify';

export interface ExportMenuProps {
  /** Makes one file, usually `(format) => runExport({ format, … })`. */
  onExport: (format: ExportFormat) => Promise<ExportResult>;
  /** The formats offered, in this order. Default CSV, Excel, PDF. */
  formats?: readonly ExportFormat[];
  /** Disables the whole menu and says why. */
  disabledReason?: string | null;
  /** Disables single formats, each with its own reason. */
  formatDisabledReasons?: Partial<Record<ExportFormat, string>>;
  /** Trigger text. Default "Export". */
  label?: string;
  /** Show the answer as a toast (default true). */
  notifyResult?: boolean;
  /** Called with every answer, after the toast. */
  onResult?: (result: ExportResult) => void;
  className?: string;
}

const COARSE_TARGET = '[@media(pointer:coarse)]:min-h-11';

export function ExportMenu({
  onExport,
  formats = EXPORT_FORMATS,
  disabledReason,
  formatDisabledReasons = {},
  label = 'Export',
  notifyResult = true,
  onResult,
  className,
}: ExportMenuProps) {
  const reasonId = useId();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const running = useRef(false);
  const reason = disabledReason?.trim() || null;

  const run = async (format: ExportFormat) => {
    if (running.current || reason || formatDisabledReasons[format]) return;
    running.current = true;
    setBusy(format);
    try {
      const result = await onExport(format);
      if (notifyResult) notifyExportResult(result);
      onResult?.(result);
    } catch (error) {
      notify.error(error, { title: 'Export not made' });
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  const triggerContent = (
    <>
      {busy ? (
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-4 w-4" aria-hidden="true" />
      )}
      {busy ? 'Exporting…' : label}
    </>
  );

  if (reason) {
    return (
      <TooltipProvider>
        <Tooltip open={hintOpen} onOpenChange={setHintOpen}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-disabled="true"
              aria-describedby={reasonId}
              data-export-menu=""
              className={cn('aria-disabled:cursor-not-allowed aria-disabled:opacity-60', className)}
              onClick={(event) => {
                event.preventDefault();
                setHintOpen(true);
              }}
            >
              {triggerContent}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-export-menu=""
          aria-busy={busy ? true : undefined}
          aria-disabled={busy ? true : undefined}
          className={cn('aria-disabled:cursor-wait aria-disabled:opacity-60', className)}
          onPointerDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (busy && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) event.preventDefault();
          }}
        >
          {triggerContent}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuLabel className="type-caption text-muted-foreground">Download as</DropdownMenuLabel>
        {formats.map((format) => {
          const why = formatDisabledReasons[format];
          return (
            <DropdownMenuItem
              key={format}
              disabled={Boolean(why)}
              data-export-format={format}
              className={cn('flex-col items-start gap-0.5', COARSE_TARGET)}
              onSelect={() => void run(format)}
            >
              <span>{EXPORT_FORMAT_LABELS[format]}</span>
              {why ? <span className="type-caption text-muted-foreground">{why}</span> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ExportMenu;
