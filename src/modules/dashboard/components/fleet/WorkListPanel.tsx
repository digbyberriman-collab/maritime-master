/**
 * The work list per vessel (gap/02 D13, W9 Technical; X5 spec X5-02B) from
 * `fleet_dashboard_panels`: open jobs, jobs awaiting approval and overdue
 * jobs on each vessel with Technical on, as a small table whose vessel
 * names open the vessel's job list. Server order (most overdue first).
 *
 * "Awaiting approval" is the gap/06 status and reads 0 until it exists. A
 * caller without the jobs rule on any vessel shown gets no panel; Technical
 * switched off on every vessel shown says so.
 */
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { TONE_FILL, TONE_TEXT } from '@/components/ui/tones';
import { cn } from '@/lib/utils';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { FleetDashboardPanelsJson } from '../../types/db.pending';
import { ExpiryPanels, PanelCard, PanelGroup, type PanelScope } from './ExpiryPanels';

export interface WorkListPanelProps extends PanelScope {
  workList: FleetDashboardPanelsJson['work_list'];
  className?: string;
}

const number = (n: number) => n.toLocaleString('en-GB');

export function WorkListPanel({ workList, className, ...scope }: WorkListPanelProps) {
  if (!ExpiryPanels.listShown('work_list', workList.state, scope)) return null;
  const vessels = workList.state === 'ok' ? workList.vessels : [];
  return (
    <PanelGroup title="Technical" description="Open jobs per vessel" columns={1} className={className}>
      <PanelCard
        list="work_list"
        title="Work list"
        icon={Wrench}
        state={workList.state === 'ok' ? 'ok' : 'module_off'}
        offText="Technical is off on every vessel shown."
        total={workList.state === 'ok' ? vessels.length : undefined}
        rows={[]}
        emptyText="No vessel with Technical on."
        viewAllHref={scope.viewAllHref?.('work_list')}
        countNoun="vessel"
      >
        {vessels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vessel with Technical on.</p>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm tabular-nums">
            <caption className="sr-only">Open, overdue and awaiting-approval jobs per vessel</caption>
            <thead>
              <tr className="text-left type-caption text-muted-foreground">
                <th scope="col" className="border-b border-border pb-2 font-medium">
                  Vessel
                </th>
                <th scope="col" className="w-12 border-b border-border pb-2 text-right font-medium">
                  Open
                </th>
                <th scope="col" className="w-16 border-b border-border pb-2 text-right font-medium">
                  Overdue
                </th>
                <th scope="col" className="w-[4.5rem] border-b border-border pb-2 text-right font-medium">
                  <abbr title="Awaiting approval" className="no-underline">
                    Approval
                  </abbr>
                </th>
              </tr>
            </thead>
            <tbody>
              {vessels.map((v) => (
                <tr key={v.vessel_id}>
                  <th scope="row" className="truncate border-b border-border py-1 pr-2 text-left font-medium text-foreground">
                    {v.vessel_code ? (
                      <Link
                        to={vesselPath(v.vessel_code, 'technical')}
                        className="-mx-1 inline-flex min-h-9 max-w-full items-center rounded-sm px-1 hover:underline focus-ring [@media(pointer:coarse)]:min-h-11"
                      >
                        <span className="truncate">{v.vessel_name}</span>
                      </Link>
                    ) : (
                      <span className="truncate">{v.vessel_name}</span>
                    )}
                  </th>
                  <td className="border-b border-border py-1 text-right text-foreground">{number(v.open)}</td>
                  <td className={cn('border-b border-border py-1 text-right', v.overdue > 0 ? cn('font-semibold', TONE_TEXT.danger) : 'text-muted-foreground')}>
                    {v.overdue > 0 ? (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', TONE_FILL.danger)} />
                        {number(v.overdue)}
                        <span className="sr-only"> overdue</span>
                      </span>
                    ) : (
                      <>
                        {number(0)}
                        <span className="sr-only"> overdue</span>
                      </>
                    )}
                  </td>
                  <td className="border-b border-border py-1 text-right text-foreground">
                    {number(v.pending_approval)}
                    <span className="sr-only"> awaiting approval</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PanelCard>
    </PanelGroup>
  );
}

export default WorkListPanel;
