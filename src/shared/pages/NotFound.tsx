import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import InkfishWatermark from '@/shared/components/InkfishWatermark';
import { StormWordmark } from '@/modules/auth/components/brand/StormWordmark';

/**
 * Standalone 404 (outside the shell). In-scope unknown URLs render the
 * shell's ScopeNotFound instead. Root is `relative isolate`, so the
 * watermark layer stays behind the content (D-DS5 keeps it on every page).
 */
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <InkfishWatermark />
      </div>
      <StormWordmark size="md" className="mb-10" />
      <main className="w-full max-w-md text-center">
        <p className="type-mono text-muted-foreground">404</p>
        <h1 className="mt-2 type-display-lg text-foreground">Page not found</h1>
        <p className="mt-2 type-body text-muted-foreground">
          The address <span className="break-all font-medium text-foreground">{location.pathname}</span> does not match a page in STORM.
        </p>
        <Button asChild variant="signal" className="mt-6">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Go to STORM
          </Link>
        </Button>
      </main>
    </div>
  );
};

export default NotFound;
