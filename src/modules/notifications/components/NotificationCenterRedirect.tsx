/**
 * `/notifications/center` → `/inbox?tab=attention` (gap/03 legacy table,
 * gap/10 IA15; D-62, D-27). The old Notification Center is the inbox's
 * Attention tab now. Its `?tab=compliance|messages|tasks` (sidebar badges,
 * bookmarks) becomes `view=…`; every other parameter, the hash and the
 * navigation state are kept (../lib/inboxTabs.ts `notificationCenterTarget`).
 *
 * A route element rather than a LEGACY_REDIRECTS row: the table copies a
 * query, it cannot rename a parameter, and the target is always open to the
 * signed-in user (personal scope), so there is nothing to resolve.
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { notificationCenterTarget } from '../lib/inboxTabs';

const NotificationCenterRedirect: React.FC = () => {
  const { search, hash, state } = useLocation();
  return <Navigate replace state={state} to={notificationCenterTarget(search, hash)} />;
};

export default NotificationCenterRedirect;
