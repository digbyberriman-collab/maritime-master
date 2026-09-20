import React from 'react';
import { ClipboardList, FileCheck2, FilePlus2, Files } from 'lucide-react';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { StaffOnlyNotice } from '@/modules/health/components/pt/PtCommon';
import { TemplateLibrary } from '@/modules/health/components/pt/TemplateLibrary';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useProgramTemplates } from '@/modules/health/hooks/usePtLibrary';

/** Build, publish and assign the programme templates the fleet trains from. */
const ProgramTemplatesPage: React.FC = () => {
  const access = useWellnessAccess();
  const library = useProgramTemplates({ includeInactive: true });

  if (!access.loading && !access.canView) {
    return (
      <div className="space-y-6">
        <HealthPageHeader
          icon={ClipboardList}
          title="Programme templates"
          description="The patterns every assigned programme is built from."
        />
        <StaffOnlyNotice what="library" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={ClipboardList}
        title="Programme templates"
        description="Week by week patterns. Assigning one copies it into the athlete's plan, so editing it later never rewrites their history."
      />

      <TemplateLibrary rehab={false} canEdit={access.canEdit}>
        <StatGrid>
          <StatTile
            icon={Files}
            label="Templates"
            value={library.isLoading ? null : library.summary.total}
          />
          <StatTile
            icon={FileCheck2}
            label="Published"
            value={library.isLoading ? null : library.summary.published}
            hint="Ready to assign"
            tone="good"
          />
          <StatTile
            icon={FilePlus2}
            label="Drafts"
            value={library.isLoading ? null : library.summary.draft}
            tone={library.summary.draft > 0 ? 'warning' : 'default'}
          />
          <StatTile
            icon={Files}
            label="Archived"
            value={library.isLoading ? null : library.summary.archived}
          />
        </StatGrid>
      </TemplateLibrary>
    </div>
  );
};

export default ProgramTemplatesPage;
