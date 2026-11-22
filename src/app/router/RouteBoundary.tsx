/**
 * The error boundary and Suspense fallback every route page shares.
 * `lazyPage()` applies both; scope layouts can reuse them around an <Outlet/>.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import { LazyLoader } from '@/shared/components/common/LazyLoader';

/**
 * Per-route error boundary. It resets when the pathname changes, without
 * remounting the page, so moving between `/x/1` and `/x/2` keeps page state
 * but always clears a previous render error.
 */
export const RouteErrorBoundary: React.FC<{ label?: string; children: React.ReactNode }> = ({
  label,
  children,
}) => {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary label={label} resetKey={pathname}>
      {children}
    </ErrorBoundary>
  );
};

/** The one Suspense fallback for route pages. */
export const RouteSuspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <React.Suspense fallback={<LazyLoader />}>{children}</React.Suspense>
);
