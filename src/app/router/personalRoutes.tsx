/**
 * Redirects into the URL-routed personal area (spec §8; gap/10 "Personal and
 * global"; gap/01 "Personal area"). Each settings section has its own URL
 * under `/me`; the old state-driven forms land on it:
 *
 *   /me                       → /me/profile
 *   /me?tab=security          → /me/security        (`?section=` alike)
 *   /settings/security        → /me/security
 *   /settings/<unknown>       → /me/profile
 *
 * The rest of the query string and the hash are kept (D-43), as
 * KeepSearchNavigate does for every router redirect.
 */
import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { isSettingsSection, settingsSectionPath } from '@/shared/utils/settingsPermissions';
import { PERSONAL_HOME } from '@/config/personalNav';
import { withSearch } from './legacyResolve';

/** The legacy query parameters that used to pick a settings section. */
const SECTION_PARAMS = ['tab', 'section'] as const;

/** `/me` index: the section a legacy `?tab=` / `?section=` names, else the profile. */
export const PersonalIndexRedirect: React.FC = () => {
  const { search, hash, state } = useLocation();
  const params = new URLSearchParams(search);
  const named = SECTION_PARAMS.map((key) => params.get(key)).find((value) => isSettingsSection(value));
  if (!named) return <Navigate replace state={state} to={withSearch(PERSONAL_HOME, search, hash)} />;
  for (const key of SECTION_PARAMS) params.delete(key);
  const rest = params.toString();
  return <Navigate replace state={state} to={withSearch(settingsSectionPath(named), rest ? `?${rest}` : '', hash)} />;
};

/** `/settings/:section`: a known section opens its `/me` URL; anything else the profile. */
export const SettingsSectionRedirect: React.FC = () => {
  const { section } = useParams<{ section: string }>();
  const { search, hash, state } = useLocation();
  const to = isSettingsSection(section) ? settingsSectionPath(section) : PERSONAL_HOME;
  return <Navigate replace state={state} to={withSearch(to, search, hash)} />;
};
