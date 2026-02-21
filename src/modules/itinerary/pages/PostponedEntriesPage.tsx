import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { useItineraryEntries, useUpdateEntry, useDeleteEntry } from '@/modules/itinerary/hooks/useItinerary';
import type { ItineraryEntry } from '@/modules/itinerary/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  PauseCircle,
  Play,
  Trash2,
  MapPin,
  Calendar,
  Ship,
  Loader2,
  ArrowLeft,
  Search,
  FileText,
  StickyNote,
} from 'lucide-react';

const PostponedEntriesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ItineraryEntry | null>(null);

  const { data: entries, isLoading } = useItineraryEntries();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();

  const postponedEntries = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e) => e.status === 'postponed');
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!search.trim()) return postponedEntries;
    const term = search.toLowerCase();
    return postponedEntries.filter(
      (e) =>
        e.title.toLowerCase().includes(term) ||
        e.location?.toLowerCase().includes(term) ||
        e.country?.toLowerCase().includes(term)
    );
  }, [postponedEntries, search]);

  const handleReinstate = (entry: ItineraryEntry, status: 'draft' | 'tentative') => {
    const label = status === 'draft' ? 'Draft' : 'Tentative';
    updateEntry.mutate(
      { id: entry.id, status },
      {
        onSuccess: () => {
          toast.success(`"${entry.title}" reinstated as ${label}`);
        },
        onError: () => {
          toast.error(`Failed to reinstate "${entry.title}"`);
        },
      }
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteEntry.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`"${deleteTarget.title}" deleted permanently`);
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(`Failed to delete "${deleteTarget.title}"`);
        setDeleteTarget(null);
      },
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/itinerary/planning">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <PauseCircle className="w-6 h-6 text-amber-500" />
                <h1 className="text-2xl font-bold">Postponed Entries</h1>
                {!isLoading && (
                  <Badge variant="secondary" className="text-sm">
                    {postponedEntries.length}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                Review and reinstate postponed itinerary entries or remove them permanently.
              </p>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, location, or country..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <PauseCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                {postponedEntries.length === 0
                  ? 'No postponed entries'
                  : 'No matching entries'}
              </h3>
              <p className="text-muted-foreground">
                {postponedEntries.length === 0
                  ? 'When you postpone itinerary entries, they will appear here for review.'
                  : 'Try adjusting your search terms.'}
              </p>
              {postponedEntries.length === 0 && (
                <Link to="/itinerary/planning">
                  <Button variant="outline" className="mt-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Planning
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => (
              <Card key={entry.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    {/* Left: Entry info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Title row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold">{entry.title}</h3>
                        {entry.trip_type && (
                          <Badge
                            style={{
                              backgroundColor: entry.trip_type.colour + '20',
                              color: entry.trip_type.colour,
                              borderColor: entry.trip_type.colour + '40',
                            }}
                            variant="outline"
                            className="text-xs"
                          >
                            {entry.trip_type.name}
                          </Badge>
                        )}
                      </div>

                      {/* Location */}
                      {(entry.location || entry.country) && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>
                            {[entry.location, entry.country].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Dates */}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>
                          {formatDate(entry.start_date)} &mdash; {formatDate(entry.end_date)}
                        </span>
                      </div>

                      {/* Vessels */}
                      {entry.vessels && entry.vessels.length > 0 && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Ship className="w-3.5 h-3.5 flex-shrink-0" />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {entry.vessels.map((ev) => (
                              <Badge key={ev.id} variant="outline" className="text-xs font-normal">
                                {ev.vessel?.name || 'Unknown vessel'}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {entry.notes && (
                        <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                          <StickyNote className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span className="italic">{entry.notes}</span>
                        </div>
                      )}

                      {/* Postponed date */}
                      <div className="text-xs text-muted-foreground/70 pt-1">
                        Postponed on {formatDate(entry.updated_at.split('T')[0])}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-row lg:flex-col gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReinstate(entry, 'draft')}
                        disabled={updateEntry.isPending}
                      >
                        <FileText className="w-4 h-4 mr-1.5" />
                        Reinstate as Draft
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReinstate(entry, 'tentative')}
                        disabled={updateEntry.isPending}
                      >
                        <Play className="w-4 h-4 mr-1.5" />
                        Reinstate as Tentative
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(entry)}
                        disabled={deleteEntry.isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Postponed Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{' '}
              <strong>{deleteTarget?.title}</strong>? This action cannot be undone
              and all associated data will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEntry.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteEntry.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEntry.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default PostponedEntriesPage;
