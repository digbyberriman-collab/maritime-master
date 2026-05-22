import React from 'react';
import { UserPlus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CrewDisplayModeSwitch } from '@/modules/crew/components/list/CrewDisplayModeSwitch';
import { CrewQuickFilterChips } from '@/modules/crew/components/list/CrewQuickFilterChips';
import { CrewAdvancedFilterSheet } from '@/modules/crew/components/list/CrewAdvancedFilterSheet';
import { CrewExportMenu } from '@/modules/crew/components/list/CrewExportMenu';
import { CrewSearchCommand } from '@/modules/crew/components/list/CrewSearchCommand';
import {
  useCrewListPreferences,
  type CrewDisplayMode,
  type CrewQuickFilter,
} from '@/modules/crew/hooks/useCrewListPreferences';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface CrewListToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  allMembers: CrewMemberWithStatus[];
  filteredMembers: CrewMemberWithStatus[];
  selectedMembers: CrewMemberWithStatus[];
  onSelectMember: (userId: string) => void;
  onAddCrew?: () => void;
  onImportCSV?: () => void;
}

export const CrewListToolbar: React.FC<CrewListToolbarProps> = ({
  searchQuery,
  onSearchChange,
  allMembers,
  filteredMembers,
  selectedMembers,
  onSelectMember,
  onAddCrew,
  onImportCSV,
}) => {
  const displayMode = useCrewListPreferences((s) => s.displayMode);
  const setDisplayMode = useCrewListPreferences((s) => s.setDisplayMode);
  const activeQuickFilters = useCrewListPreferences((s) => s.activeQuickFilters);
  const toggleQuickFilter = useCrewListPreferences((s) => s.toggleQuickFilter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CrewSearchCommand
          query={searchQuery}
          onChange={onSearchChange}
          members={allMembers}
          onSelectMember={onSelectMember}
        />
        <CrewAdvancedFilterSheet members={allMembers} />
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <CrewDisplayModeSwitch
            value={displayMode as CrewDisplayMode}
            onChange={setDisplayMode}
          />
          <CrewExportMenu all={allMembers} filtered={filteredMembers} selected={selectedMembers} />
          {onImportCSV && (
            <Button variant="outline" size="sm" onClick={onImportCSV} className="gap-1.5">
              <Upload className="h-4 w-4" /> Import
            </Button>
          )}
          {onAddCrew && (
            <Button size="sm" onClick={onAddCrew} className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Add Crew
            </Button>
          )}
        </div>
      </div>
      <CrewQuickFilterChips
        active={activeQuickFilters as CrewQuickFilter[]}
        onToggle={toggleQuickFilter}
      />
    </div>
  );
};
