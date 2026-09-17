import React, { useMemo } from 'react';
import { UserRoundPlus, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useHrCrewDirectory, type HrCrewDirectoryEntry } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useNextOfKinCoverage } from '@/modules/hris/hooks/useCrewNextOfKin';

interface MissingNextOfKinTableProps {
  onSelect: (profileId: string) => void;
}

const initials = (e: HrCrewDirectoryEntry) => `${e.first_name?.[0] ?? ''}${e.last_name?.[0] ?? ''}`.toUpperCase();

/** Active crew with no next-of-kin row at all, so HR can chase them. */
export const MissingNextOfKinTable: React.FC<MissingNextOfKinTableProps> = ({ onSelect }) => {
  const directory = useHrCrewDirectory();
  const coverage = useNextOfKinCoverage();

  const missing = useMemo(
    () => directory.entries.filter((e) => !coverage.coveredProfileIds.has(e.id)),
    [directory.entries, coverage.coveredProfileIds],
  );
  const loading = directory.isLoading || coverage.isLoading;
  const error = directory.error ?? coverage.error;
  const total = directory.entries.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Crew without a next of kin
        </CardTitle>
        <CardDescription>
          {loading
            ? 'Checking coverage…'
            : missing.length === 0
              ? `All ${total} active crew have at least one contact recorded.`
              : `${missing.length} of ${total} active crew have nobody recorded. Select a row to add one.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <p className="p-6 text-sm text-destructive">Could not load coverage: {error instanceof Error ? error.message : 'unknown error'}</p>
        ) : loading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : missing.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nothing to chase.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Crew</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {missing.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => onSelect(e.id)}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={e.avatar_url ?? undefined} alt="" />
                          <AvatarFallback className="text-[10px]">{initials(e)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{e.displayName}</span>
                        {e.is_imported && <Badge variant="outline" className="text-[10px]">Imported</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.rank ?? e.position ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{e.vessel_name ?? 'Unassigned'}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">{e.email}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onSelect(e.id);
                        }}
                      >
                        <UserRoundPlus className="h-4 w-4" /> Add contact
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MissingNextOfKinTable;
