/**
 * True while the viewer's role is not known yet: auth is loading, or a
 * signed-in user's profile has not arrived (for at most PROFILE_GRACE_MS,
 * D-54 / D-59). Role-gated pages show a loading state while this is true and
 * decide only once it is false, so a deep link or a reload never falsely
 * denies someone whose profile loads late. After the grace period the
 * profile counts as unreadable and the page fails closed (D-04).
 */
import React from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { PROFILE_GRACE_MS } from '@/app/router/useScopeAccess';

export function useRolePending(): boolean {
  const { user, profile, loading } = useAuth();
  const waitingForProfile = !!user && !profile && !loading;
  const [gaveUp, setGaveUp] = React.useState(false);
  React.useEffect(() => {
    if (!waitingForProfile) {
      setGaveUp(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setGaveUp(true), PROFILE_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [waitingForProfile]);
  return loading || (waitingForProfile && !gaveUp);
}
