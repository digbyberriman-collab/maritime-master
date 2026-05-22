import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CrewListToolbar } from '@/modules/crew/components/list/CrewListToolbar';
import { CrewBulkActionsBar } from '@/modules/crew/components/list/CrewBulkActionsBar';
import { CrewTableView } from '@/modules/crew/components/list/views/CrewTableView';
import { CrewCardView } from '@/modules/crew/components/list/views/CrewCardView';
import { CrewCompactView } from '@/modules/crew/components/list/views/CrewCompactView';
import { CrewMusterView } from '@/modules/crew/components/list/views/CrewMusterView';
import { CrewListEmptyState } from '@/modules/crew/components/list/CrewListEmptyState';
import { CrewProfileDrawer } from '@/modules/crew/components/profile/CrewProfileDrawer';
import { BulkEmailDialog } from '@/modules/crew/components/bulk/BulkEmailDialog';
import { BulkEditDialog } from '@/modules/crew/components/bulk/BulkEditDialog';
import { BulkReassignVesselDialog } from '@/modules/crew/components/bulk/BulkReassignVesselDialog';
import { useCrewListPreferences } from '@/modules/crew/hooks/useCrewListPreferences';
import { useCrewSelection, useSelectedCrewIds } from '@/modules/crew/hooks/useCrewSelection';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface CrewListLayoutProps {
  members: CrewMemberWithStatus[];
  onAddCrew?: () => void;
  onImportCSV?: () => void;
}

const matchesQuery = (m: CrewMemberWithStatus, q: string) => {
  if (!q) return true;
  const lower = q.toLowerCase();
  return [
    m.first_name, m.last_name, m.preferred_name,
    m.rank, m.nationality, m.email, m.department,
    m.cabin, m.passport_number,
    m.current_assignment?.vessel_name,
  ]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(lower));
};

export const CrewListLayout: React.FC<CrewListLayoutProps> = ({ members, onAddCrew, onImportCSV }) => {
  const displayMode = useCrewListPreferences((s) => s.displayMode);
  const activeQuickFilters = useCrewListPreferences((s) => s.activeQuickFilters);
  const advancedFilters = useCrewListPreferences((s) => s.advancedFilters);
  const clearQuickFilters = useCrewListPreferences((s) => s.clearQuickFilters);
  const clearAdvancedFilters = useCrewListPreferences((s) => s.clearAdvancedFilters);
  const selectionClear = useCrewSelection((s) => s.clear);
  const selectedIds = useSelectedCrewIds();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCrewId = searchParams.get('crewId');
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkReassignOpen, setBulkReassignOpen] = useState(false);

  const selectMember = (userId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('crewId', userId);
    setSearchParams(next, { replace: true });
  };
  const closeDrawer = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('crewId');
    setSearchParams(next, { replace: true });
  };

  // Reset row selection on filter change to avoid stale ghost selections
  // referencing crew that are no longer visible.
  useEffect(() => () => selectionClear(), [selectionClear]);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (!matchesQuery(m, searchQuery)) return false;

      if (activeQuickFilters.includes('onboard') && !m.isOnboard) return false;
      if (activeQuickFilters.includes('on_leave') && !m.isOnLeave) return false;
      if (activeQuickFilters.includes('cert_expiring') && m.certStatus !== 'expiring' && m.certStatus !== 'expired') return false;
      if (activeQuickFilters.includes('medical_expiring') && m.medicalStatus !== 'expiring' && m.medicalStatus !== 'expired') return false;
      if (activeQuickFilters.includes('no_assignment') && m.hasAssignment) return false;
      if (activeQuickFilters.includes('contract_ending') && !m.contractEndingSoon) return false;

      if (advancedFilters.ranks.length && !advancedFilters.ranks.includes(m.rank ?? '')) return false;
      if (advancedFilters.departments.length && !advancedFilters.departments.includes(m.department ?? '')) return false;
      if (advancedFilters.vessels.length && !advancedFilters.vessels.includes(m.current_assignment?.vessel_name ?? '')) return false;
      if (advancedFilters.nationalities.length && !advancedFilters.nationalities.includes(m.nationality ?? '')) return false;
      if (advancedFilters.accountStatuses.length && !advancedFilters.accountStatuses.includes(m.account_status ?? '')) return false;
      if (advancedFilters.certStatuses.length && !advancedFilters.certStatuses.includes(m.certStatus)) return false;
      if (advancedFilters.medicalStatuses.length && !advancedFilters.medicalStatuses.includes(m.medicalStatus)) return false;
      if (advancedFilters.contractEndFrom && (m.contract_end_date ?? '') < advancedFilters.contractEndFrom) return false;
      if (advancedFilters.contractEndTo && (m.contract_end_date ?? '') > advancedFilters.contractEndTo) return false;

      return true;
    });
  }, [members, searchQuery, activeQuickFilters, advancedFilters]);

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.includes(m.id)),
    [members, selectedIds]
  );
  const drawerMember = useMemo(
    () => members.find((m) => (m.user_id ?? m.id) === selectedCrewId) ?? null,
    [members, selectedCrewId]
  );

  const anyFilterActive =
    searchQuery.length > 0 ||
    activeQuickFilters.length > 0 ||
    advancedFilters.ranks.length +
      advancedFilters.departments.length +
      advancedFilters.vessels.length +
      advancedFilters.nationalities.length +
      advancedFilters.accountStatuses.length +
      advancedFilters.certStatuses.length +
      advancedFilters.medicalStatuses.length > 0;

  return (
    <div className="space-y-4">
      <CrewListToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allMembers={members}
        filteredMembers={filtered}
        selectedMembers={selectedMembers}
        onSelectMember={selectMember}
        onAddCrew={onAddCrew}
        onImportCSV={onImportCSV}
      />

      {members.length === 0 ? (
        <CrewListEmptyState variant="empty" onAddCrew={onAddCrew} />
      ) : filtered.length === 0 && anyFilterActive ? (
        <CrewListEmptyState
          variant="filtered"
          onClearFilters={() => {
            setSearchQuery('');
            clearQuickFilters();
            clearAdvancedFilters();
          }}
        />
      ) : displayMode === 'card' ? (
        <CrewCardView members={filtered} onSelectMember={selectMember} />
      ) : displayMode === 'compact' ? (
        <CrewCompactView members={filtered} onSelectMember={selectMember} />
      ) : displayMode === 'muster' ? (
        <CrewMusterView members={filtered} onSelectMember={selectMember} />
      ) : (
        <CrewTableView members={filtered} onSelectMember={selectMember} />
      )}

      <CrewBulkActionsBar
        onEmail={() => setBulkEmailOpen(true)}
        onReassign={() => setBulkReassignOpen(true)}
        onBulkEdit={() => setBulkEditOpen(true)}
      />

      <BulkEmailDialog open={bulkEmailOpen} onOpenChange={setBulkEmailOpen} members={selectedMembers} />
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        userIds={selectedMembers.map((m) => m.user_id).filter((id): id is string => !!id)}
      />
      <BulkReassignVesselDialog
        open={bulkReassignOpen}
        onOpenChange={setBulkReassignOpen}
        userIds={selectedMembers.map((m) => m.user_id).filter((id): id is string => !!id)}
      />

      <CrewProfileDrawer
        member={drawerMember}
        open={!!drawerMember}
        onOpenChange={(o) => { if (!o) closeDrawer(); }}
      />
    </div>
  );
};
