import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { diffLines, diffStats, withContext } from '@/modules/legal/lib/diff';

interface VersionDiffProps {
  oldLabel: string;
  oldText: string;
  newLabel: string;
  newText: string;
}

/** Inline line diff between two versions with collapsible unchanged runs. */
export const VersionDiff: React.FC<VersionDiffProps> = ({ oldLabel, oldText, newLabel, newText }) => {
  const [full, setFull] = useState(false);
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText]);
  const stats = useMemo(() => diffStats(lines), [lines]);
  const rows = useMemo(() => (full ? lines : withContext(lines, 3)), [lines, full]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Comparing <span className="font-medium text-foreground">{oldLabel}</span> → <span className="font-medium text-foreground">{newLabel}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-success">+{stats.added}</span>
          <span className="text-critical">−{stats.removed}</span>
          <span className="text-muted-foreground">{stats.unchanged} unchanged</span>
          {stats.added + stats.removed > 0 && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setFull((f) => !f)}>
              {full ? 'Collapse unchanged' : 'Show all lines'}
            </Button>
          )}
        </span>
      </div>
      {stats.added + stats.removed === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">These versions have identical content.</p>
      ) : (
        <div className="max-h-[60vh] overflow-auto font-mono text-xs">
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((row, i) =>
                row.op === 'skip' ? (
                  <tr key={i} className="bg-muted/40 text-muted-foreground">
                    <td colSpan={3} className="px-3 py-1 text-center">
                      ··· {row.count} unchanged line{row.count === 1 ? '' : 's'} ···
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className={cn(row.op === 'add' && 'bg-success/10', row.op === 'remove' && 'bg-critical/10')}>
                    <td className="w-10 select-none border-r border-border px-2 text-right text-muted-foreground">{row.oldLine ?? ''}</td>
                    <td className="w-10 select-none border-r border-border px-2 text-right text-muted-foreground">{row.newLine ?? ''}</td>
                    <td className={cn('whitespace-pre-wrap px-3 py-0.5', row.op === 'add' && 'text-success', row.op === 'remove' && 'text-critical line-through decoration-critical/40')}>
                      <span className="mr-2 select-none opacity-60">{row.op === 'add' ? '+' : row.op === 'remove' ? '−' : ' '}</span>
                      {row.text || ' '}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default VersionDiff;
