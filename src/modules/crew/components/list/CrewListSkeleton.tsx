import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const CrewListSkeleton: React.FC = () => (
  <div className="space-y-2">
    <div className="flex gap-2">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-9 w-24 ml-auto" />
    </div>
    <div className="border rounded-md">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      ))}
    </div>
  </div>
);
