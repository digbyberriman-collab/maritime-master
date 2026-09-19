import React from 'react';
import { HeartPulse, Stethoscope } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { StaffOnlyNotice } from '@/modules/health/components/pt/PtCommon';
import { TemplateLibrary } from '@/modules/health/components/pt/TemplateLibrary';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useProgramTemplates } from '@/modules/health/hooks/usePtLibrary';

/**
 * Rehabilitation protocols. The same table as programme templates with
 * `is_rehab` set, reached from both Physiotherapy and Personal training, so
 * nothing here assumes the reader is a trainer.
 */
const RehabProtocolLibraryPage: React.FC = () => {
  const access = useWellnessAccess();
  const library = useProgramTemplates({ rehabOnly: true, includeInactive: true });

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader
          icon={HeartPulse}
          title="Rehabilitation protocols"
          description="Staged protocols shared by physiotherapy and training."
        />
        <StaffOnlyNotice what="library" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={HeartPulse}
        title="Rehabilitation protocols"
        description="Staged protocols by body region. Written by the physiotherapist, run by whoever is on board."
      />

      <Alert>
        <Stethoscope className="h-4 w-4" />
        <AlertTitle>One library, two doors</AlertTitle>
        <AlertDescription>
          These protocols are the same records shown under Physiotherapy. Editing one here changes it
          for both. Protocols already assigned to a patient keep their own copy and are not affected.
        </AlertDescription>
      </Alert>

      <TemplateLibrary rehab canEdit={access.canEdit}>
        <StatGrid className="lg:grid-cols-3">
          <StatTile
            icon={HeartPulse}
            label="Protocols"
            value={library.isLoading ? null : library.summary.total}
          />
          <StatTile
            icon={HeartPulse}
            label="Published"
            value={library.isLoading ? null : library.summary.published}
            tone="good"
            hint="Ready to assign"
          />
          <StatTile
            icon={HeartPulse}
            label="Drafts"
            value={library.isLoading ? null : library.summary.draft}
            tone={library.summary.draft > 0 ? 'warning' : 'default'}
          />
        </StatGrid>
      </TemplateLibrary>
    </div>
  );
};

export default RehabProtocolLibraryPage;
