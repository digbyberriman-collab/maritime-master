import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <span className="text-3xl font-black tracking-tight text-primary">STORM</span>
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Every real page routes through here, so one boundary keyed on the path
  // contains a failing page and clears itself when the user navigates away.
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
};

export default ProtectedRoute;
