/**
 * Empties the React Query cache when the signed-in user changes: on sign-out,
 * and on a switch straight from one account to another. Cached results are
 * the previous user's (another company's, possibly), and the queries are not
 * keyed by user, so the next user must never be served them (D-25).
 *
 * The first sign-in of a page load clears nothing: there is no previous user.
 * Mounted under QueryClientProvider and inside AuthProvider (src/App.tsx).
 */
import { useEffect, useRef, type FC } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

const QueryCacheReset: FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current !== null && previous.current !== userId) queryClient.clear();
    previous.current = userId;
  }, [userId, queryClient]);

  return null;
};

export default QueryCacheReset;
