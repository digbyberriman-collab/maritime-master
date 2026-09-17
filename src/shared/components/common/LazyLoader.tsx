import React from 'react';
import { Loader2 } from 'lucide-react';

/** Suspense fallback for lazily loaded module pages. */
export const LazyLoader: React.FC = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

export default LazyLoader;
