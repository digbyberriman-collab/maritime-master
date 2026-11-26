/**
 * The crew profile's Hours of rest tab (gap/04 C37-C39; X1 spec §4:
 * crew/people/:profileId/hours-of-rest?month=2026-11&day=2026-11-21). It
 * replaces the old crew/people/:crewId/hours-of-rest page: the profile's
 * :tab route serves the same URL, and a legacy login id in it is resolved
 * by the profile page (crew_profile_resolve, D-X1-19), so the board's and
 * the crew list's links keep working.
 *
 * - Gate: the person's own profile (view_own, which every active crew
 *   member holds), or vessel.crew.hours_of_rest.view on the route vessel.
 *   Nothing is read while the answer loads; denied is AccessDenied. The
 *   vessel route gate has already closed the URL when the vessel's Crew or
 *   Hours of Rest module is off (the Hours of Rest leaf covers
 *   crew/people/<person>/hours-of-rest).
 * - Hours of rest key on the person's login; a person without one has no
 *   hours to show yet, and the tab says so.
 * - The month itself is the work-rest module's HorMonthView, the same view
 *   as /me/hours-of-rest, on the route vessel.
 */
import React from 'react';
import { Clock } from 'lucide-react';
import { AccessDenied, EmptyState, PageLoading } from '@/shared/components/states';
import { useCapability } from '@/lib/permissions/useCan';
import { useVesselScope } from '@/app/router/scopes';
import { CREW_CAPS } from '@/modules/crew/paths';
import type { ProfileTabProps } from '@/modules/crew/lib/profileTabs';
import { HorMonthView } from '@/modules/work-rest/pages/MyWorkRestMonth';

export const NO_LOGIN_HOURS =
  'Hours of rest are kept against a STORM sign-in. They can be entered here once this person has joined STORM.';

const HoursOfRestTab: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const gate = useCapability(CREW_CAPS.horView, { vesselId: vessel.id });
  const code = useVesselScope()?.code ?? null;

  if (!profile.isOwn) {
    if (gate.status === 'loading') return <PageLoading variant="detail" label="Loading hours…" />;
    if (!gate.allowed) {
      return (
        <AccessDenied
          title="You can't see these hours of rest"
          detail="Hours of rest of others need hours of rest access on this vessel. Ask your fleet manager for it."
          headingLevel={2}
        />
      );
    }
  }
  if (!profile.userId) {
    return <EmptyState kind="first-use" icon={Clock} bordered title="No hours of rest yet" body={NO_LOGIN_HOURS} headingLevel={2} />;
  }
  return (
    <HorMonthView
      scope="profile"
      vessel={{ id: vessel.id, name: vessel.name, code }}
      subject={{
        userId: profile.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        name: profile.displayName,
        detail: [profile.positionName ?? profile.positionText, profile.departmentLabel].filter(Boolean).join(' · ') || null,
      }}
      isOwn={profile.isOwn}
    />
  );
};

export default HoursOfRestTab;
