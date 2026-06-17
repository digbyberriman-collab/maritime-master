import { ReactNode } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { NewBuildProjectProvider } from '@/modules/new-build/contexts/NewBuildProjectContext';
import { NewBuildProjectPicker } from './NewBuildProjectPicker';

/**
 * Wraps every New Build page so they share the project picker + provider,
 * sitting inside STORM's standard DashboardLayout.
 */
export default function NewBuildShell({ children }: { children: ReactNode }) {
  return (
    <NewBuildProjectProvider>
      <DashboardLayout>
        <div className="space-y-4">
          <NewBuildProjectPicker />
          {children}
        </div>
      </DashboardLayout>
    </NewBuildProjectProvider>
  );
}
