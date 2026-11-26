/**
 * Remind (gap/04 C41): one in-app reminder to a crew member to enter and
 * submit their month, through work_rest_remind (one manual reminder per
 * person and vessel a day; the server checks it again and records who sent
 * it). Under the button, the last reminder ("Reminded 3 Nov by Chief
 * Officer"). Not offered for one's own month, a month already submitted or
 * someone on leave all month; disabled once reminded today, with the
 * reason. A toast confirms only what the server says it sent.
 */
import React from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { notify } from '@/shared/lib/notify';
import { REMIND_BLOCK_TEXT, displayName, reminderLine, remindState, type BoardMember, type BoardViewer } from '../../lib/horBoard';
import { boardErrorText, useRemindCrew } from '../../hooks/useVesselBoard';

export interface RemindButtonProps {
  vesselId: string;
  member: BoardMember;
  viewer: BoardViewer;
  year: number;
  month: number;
  className?: string;
}

export const RemindButton: React.FC<RemindButtonProps> = ({ vesselId, member, viewer, year, month, className }) => {
  const remind = useRemindCrew(vesselId);
  const { can, block } = remindState(member, viewer);
  const line = reminderLine(member.lastReminder);
  const name = displayName(member);
  const whyId = `remind-why-${member.userId}`;
  // Only a month still open to the crew member offers Remind at all.
  const offered = block === null || block === 'reminded_today';

  const send = async () => {
    try {
      const out = await remind.mutateAsync({ crewIds: [member.userId], year, month });
      if (out.sent > 0) notify.success(`Reminder sent to ${name}`);
      else notify.info(out.skipped[0]?.reason === 'month_closed' ? 'Their month is already submitted.' : 'Already reminded today.');
    } catch (e) {
      notify.error(boardErrorText(e), { title: 'The reminder was not sent' });
    }
  };

  return (
    <div className={cn('flex min-w-0 flex-col items-start gap-1', className)} data-remind={can ? 'ready' : block ?? undefined}>
      {offered ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="[@media(pointer:coarse)]:h-11"
          disabled={!can || remind.isPending}
          aria-describedby={!can ? whyId : undefined}
          onClick={send}
        >
          <BellRing aria-hidden="true" />
          {remind.isPending ? 'Sending…' : 'Remind'}
        </Button>
      ) : null}
      {!can && block === 'reminded_today' ? (
        <span id={whyId} className="sr-only">
          {REMIND_BLOCK_TEXT.reminded_today}
        </span>
      ) : null}
      {line ? <span className="type-caption text-muted-foreground">{line}</span> : null}
    </div>
  );
};

export default RemindButton;
