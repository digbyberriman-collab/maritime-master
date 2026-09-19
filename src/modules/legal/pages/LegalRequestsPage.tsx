import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { RequestFiltersBar } from '@/modules/legal/components/requests/RequestFiltersBar';
import { RequestTable } from '@/modules/legal/components/requests/RequestTable';
import { useLegalRequests } from '@/modules/legal/hooks/useLegalRequests';
import { useLegalPeople, useLegalTeam, useLegalVessels } from '@/modules/legal/hooks/useLegalLookups';
import { STATUSES } from '@/modules/legal/lib/constants';
import { downloadTextFile, exportFilename, requestsToCsv } from '@/modules/legal/lib/export';
import { DEFAULT_REQUEST_FILTERS, filterRequests, isOpen, sortRequests, type RequestFilters } from '@/modules/legal/lib/requests';
import { errorMessage } from '@/modules/legal/lib/storage';
import { LEGAL_PATHS } from '@/modules/legal/paths';

const LegalRequestsPage: React.FC = () => {
  const { user } = useAuth();
  const access = useLegalAccess();
  const { requests, isLoading, error } = useLegalRequests();
  const { members } = useLegalTeam();
  const { nameFor } = useLegalPeople();
  const { vesselName } = useLegalVessels();
  const [filters, setFilters] = useState<RequestFilters>(DEFAULT_REQUEST_FILTERS);

  const rows = useMemo(() => sortRequests(filterRequests(requests, filters, user?.id)), [requests, filters, user?.id]);

  const counts = useMemo(() => {
    const base = { ...filters, status: 'all' as const };
    const scoped = filterRequests(requests, base, user?.id);
    const out: Record<string, number> = { all: scoped.length, open: scoped.filter((r) => isOpen(r.status)).length };
    for (const s of STATUSES) out[s.value] = scoped.filter((r) => r.status === s.value).length;
    return out;
  }, [requests, filters, user?.id]);

  const exportCsv = () => {
    downloadTextFile(exportFilename('legal-requests', 'csv'), requestsToCsv(rows, { nameFor, vesselName }));
  };

  return (
    <LegalShell
      description={access.canEdit ? 'Every legal request in the company. Triage, assign and resolve against the SLA.' : 'Requests you have raised with the legal team.'}
      actions={
        <>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button asChild>
            <Link to={LEGAL_PATHS.newRequest}>
              <Plus className="mr-2 h-4 w-4" /> New request
            </Link>
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load requests</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}
      <RequestFiltersBar filters={filters} onChange={setFilters} counts={counts} team={members} showTeamFilters={access.canView} />
      <RequestTable
        rows={rows}
        isLoading={isLoading}
        showAssignee={access.canView}
        emptyTitle={requests.length === 0 ? 'No legal requests yet' : 'No requests match'}
        emptyText={requests.length === 0 ? 'Raise the first one with the New request button.' : 'Try clearing a filter.'}
      />
    </LegalShell>
  );
};

export default LegalRequestsPage;
