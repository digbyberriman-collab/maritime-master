import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import type { CapabilityKey } from '@/lib/permissions/types';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { todayDateOnly } from '@/shared/lib/form';
import { CREW_CAPS, CREW_PATHS } from '@/modules/crew/paths';
import {
  useCrewProfileResolve,
  useCrewProfileSummary,
  type CrewProfileSummary,
  type ProfileVessel,
} from '@/modules/crew/hooks/useCrewProfile';
import {
  DEFAULT_PROFILE_TAB,
  PROFILE_TAB_COMPONENTS,
  profilePath,
  profileTabFor,
  resolveProfileTab,
  visibleProfileTabs,
  type ProfileTabDef,
} from '@/modules/crew/lib/profileTabs';
import { SAVE_UNAVAILABLE } from '@/modules/crew/lib/personalDetailsSchema';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings } from '@/modules/vessels/lib/moduleSettings';
import { ProfileHeader } from '@/modules/crew/components/profile/ProfileHeader';

interface RouteVessel extends ProfileVessel {
  name: string;
}

const NOT_SHOWN_TITLE = 'This crew member can’t be shown';
const NOT_SHOWN_DETAIL =
  'They may not exist, or they are not on the crew of a vessel whose crew profiles you can see. Ask your fleet manager if you need access.';

/**
 * The routed crew profile (gap/04 C16, improvement 17; X1-03): one URL per
 * person and tab, `crew/people/:profileId/:tab` on the vessel (the bare
 * `crew/people/:profileId` redirects to Personal).
 *
 * - Gate: the person's own profile, or vessel.crew.crew_profiles.view on
 *   the route vessel (the route guard is the scope); nothing is read while
 *   the answer is loading, AccessDenied when denied. The server decides
 *   again (crew_profile_resolve / crew_profile_summary answer only for
 *   people the caller may see).
 * - The URL's id may be a legacy login id: it is resolved to profiles.id
 *   and the URL replaced (D-X1-19), so old links keep working.
 * - An unknown tab, or one the viewer may not open, lands on Personal.
 * - The crumb and document title name the person (usePageLocationOverride).
 * - D-01: without the crew update the header is built from profiles (no
 *   status, no switcher) and the tabs are read-only.
 */
const CrewProfilePage: React.FC = () => {
  const { profileId: ref = '', tab } = useParams();
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const { profile: me, user, loading: authLoading } = useAuth();
  const gate = useCapability(CREW_CAPS.profilesView, { vesselId: vessel?.id ?? null });
  const own = Boolean(ref) && (ref === me?.id || ref === user?.id);

  if (!vessel) {
    return <PageEmpty title="Choose a vessel" body="Crew profiles open from a vessel's crew list." />;
  }
  if (authLoading) return <PageLoading variant="detail" label="Loading profile…" />;
  if (!own) {
    if (gate.status === 'loading') return <PageLoading variant="detail" label="Loading profile…" />;
    if (!gate.allowed) {
      return (
        <AccessDenied
          title="You can't see this crew profile"
          detail="Crew profiles of others need crew profile access on this vessel. Ask your fleet manager for it."
        />
      );
    }
  }
  const routeVessel: RouteVessel = { id: vessel.id, companyId: vessel.company_id, name: vessel.name };
  return <ProfileBody key={`${vessel.id}:${ref}`} vessel={routeVessel} refId={ref} tab={tab ?? null} ownProfileId={me?.id ?? null} />;
};

const ProfileBody: React.FC<{ vessel: RouteVessel; refId: string; tab: string | null; ownProfileId: string | null }> = ({ vessel, refId, tab, ownProfileId }) => {
  const location = useLocation();
  const scopedPath = useScopedPath();
  const resolved = useCrewProfileResolve(vessel, refId);

  if (resolved.status === 'idle' || resolved.status === 'loading') return <PageLoading variant="detail" label="Loading profile…" />;
  if (resolved.status === 'error') {
    return <PageError error={resolved.error} onRetry={resolved.retry} title="This profile could not load" treatMissingAsOff={false} headingLevel={1} />;
  }
  if (resolved.status === 'not_found') {
    return <AccessDenied title={NOT_SHOWN_TITLE} detail={NOT_SHOWN_DETAIL} backTo={{ to: scopedPath(CREW_PATHS.list), label: 'Back to the crew list' }} />;
  }
  if (resolved.profileId !== refId) {
    // A legacy login id (or another spelling): land on the profiles.id URL.
    const target = scopedPath(profilePath(resolved.profileId, profileTabFor(tab)?.key ?? DEFAULT_PROFILE_TAB));
    return <Navigate replace to={`${target}${location.search}`} />;
  }
  return <ProfileView vessel={vessel} profileId={resolved.profileId} tab={tab} ownProfileId={ownProfileId} />;
};

const ProfileView: React.FC<{ vessel: RouteVessel; profileId: string; tab: string | null; ownProfileId: string | null }> = ({ vessel, profileId, tab, ownProfileId }) => {
  const location = useLocation();
  const scopedPath = useScopedPath();
  const ctx = { vesselId: vessel.id };
  const canViewProfiles = useCan(CREW_CAPS.profilesView, ctx);
  const canEditProfiles = useCan(CREW_CAPS.profilesEdit, ctx);
  // The other keys a tab names (PROFILE_TAB_CAPABILITIES), for the D-01 fallback's tab list.
  const canViewHours = useCan(CREW_CAPS.horView, ctx);
  const canViewMedical = useCan(CREW_CAPS.medicalRecordsView, ctx);
  // A tab's vessel module setting (Hours of rest: crew_hor) closes it once the settings are known;
  // the vessel route gate holds the tab's own URL while they load or fail.
  const moduleSettings = useVesselModuleSettings(vessel.id);
  const modules = useMemo(() => resolveModuleSettings(moduleSettings.state, localIsoDate()), [moduleSettings.state]);
  const summary = useCrewProfileSummary(vessel, profileId, { ownProfileId });

  if (summary.status === 'idle' || summary.status === 'loading') return <PageLoading variant="detail" label="Loading profile…" />;
  if (summary.status === 'error') {
    return <PageError error={summary.error} onRetry={summary.retry} title="This profile could not load" treatMissingAsOff={false} headingLevel={1} />;
  }
  if (summary.status === 'not_found') {
    return <AccessDenied title={NOT_SHOWN_TITLE} detail={NOT_SHOWN_DETAIL} backTo={{ to: scopedPath(CREW_PATHS.list), label: 'Back to the crew list' }} />;
  }

  const capabilities: Partial<Record<CapabilityKey, boolean>> = {
    [CREW_CAPS.profilesView]: canViewProfiles,
    [CREW_CAPS.horView]: canViewHours,
    [CREW_CAPS.medicalRecordsView]: canViewMedical,
  };
  const visible = visibleProfileTabs({
    serverTabs: summary.summary.tabs,
    own: summary.summary.isOwn,
    can: (key) => capabilities[key] ?? false,
    moduleOn: modules.status === 'ready' ? (key) => modules.isModuleOn(key) : undefined,
  });
  const active = resolveProfileTab(tab, visible);
  if (!active) {
    return <AccessDenied title={NOT_SHOWN_TITLE} detail={NOT_SHOWN_DETAIL} backTo={{ to: scopedPath(CREW_PATHS.list), label: 'Back to the crew list' }} />;
  }
  if (active.key !== tab) {
    return <Navigate replace to={`${scopedPath(profilePath(profileId, active.key))}${location.search}`} />;
  }
  return (
    <ProfileReady
      vessel={vessel}
      summary={summary.summary}
      tabs={visible}
      active={active}
      fallbackCanEdit={summary.summary.isOwn || canEditProfiles}
    />
  );
};

const tabLink = (active: boolean) =>
  cn(
    'relative inline-flex h-full shrink-0 snap-start items-center whitespace-nowrap rounded-sm px-3 type-body font-medium transition-colors duration-quick ease-tide',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    'after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-transform after:duration-indicator after:ease-tide',
    active ? 'text-foreground after:scale-x-100 after:shadow-glow-signal' : 'text-muted-foreground after:scale-x-0 hover:text-foreground',
  );

const ProfileReady: React.FC<{
  vessel: RouteVessel;
  summary: CrewProfileSummary;
  tabs: readonly ProfileTabDef[];
  active: ProfileTabDef;
  /** In the D-01 fallback: whether Edit profile would be the viewer's (shown disabled with the reason). */
  fallbackCanEdit: boolean;
}> = ({ vessel, summary, tabs, active, fallbackCanEdit }) => {
  usePageLocationOverride({ title: summary.displayName, crumbs: 'page' });
  const scopedPath = useScopedPath();
  const { vessels } = useVessel();
  const nameOfVessel = (id: string) => vessels.find((v) => v.id === id)?.name ?? null;
  const today = useMemo(() => todayDateOnly(), []);
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    // Keep the active tab in view when the row scrolls (390 px phones).
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active.key]);

  const server = summary.source === 'server';
  const editPath = server && (summary.canEdit || summary.canEditSelf) ? `${scopedPath(profilePath(summary.profileId, 'personal'))}?edit=1` : null;
  const TabBody = PROFILE_TAB_COMPONENTS[active.key];

  return (
    <div className="min-w-0 space-y-4" data-crew-profile={summary.source}>
      <ProfileHeader
        summary={summary}
        vesselName={vessel.name}
        nameOfVessel={nameOfVessel}
        scopedPath={scopedPath}
        pathFor={(profileId) => scopedPath(profilePath(profileId, active.key))}
        editPath={editPath}
        editUnavailableReason={!server && fallbackCanEdit ? SAVE_UNAVAILABLE : null}
        today={today}
      />
      <nav aria-label="Profile sections" className="min-w-0">
        <ul
          className="flex h-11 max-w-full snap-x items-stretch gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain shadow-[inset_0_-1px_0_0_hsl(var(--border))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-profile-tabs=""
        >
          {tabs.map((t) => {
            const isActive = t.key === active.key;
            return (
              <li key={t.key} className="flex shrink-0">
                <Link
                  ref={isActive ? activeRef : undefined}
                  to={scopedPath(profilePath(summary.profileId, t.key))}
                  aria-current={isActive ? 'page' : undefined}
                  data-active={isActive ? 'true' : undefined}
                  className={tabLink(isActive)}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0" data-profile-tab={active.key}>
        <Suspense fallback={<PageLoading variant="detail" label={`Loading ${active.label.toLowerCase()}…`} />}>
          {TabBody ? <TabBody profile={summary} vessel={vessel} /> : null}
        </Suspense>
      </div>
    </div>
  );
};

export default CrewProfilePage;
