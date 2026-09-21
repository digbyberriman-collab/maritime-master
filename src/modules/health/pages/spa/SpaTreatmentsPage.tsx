import React, { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { TreatmentDialog } from '@/modules/health/components/spa/TreatmentDialog';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';
import {
  TREATMENT_CATEGORIES,
  treatmentCategoryLabel,
  useSpaTreatments,
  type SpaTreatment,
  type TreatmentFormData,
} from '@/modules/health/hooks/useSpa';
import { formatDuration, formatMinor } from '@/modules/health/lib/format';

const ALL = '__all__';

/** The treatment menu: what the spa offers, how long it takes and what it costs. */
const SpaTreatmentsPage: React.FC = () => {
  const wellness = useWellnessAccess();
  const canEdit = !wellness.loading && wellness.canEdit;
  const { settings } = useHealthSettings();
  const defaultCurrency = settings?.default_currency ?? 'EUR';

  const [showArchived, setShowArchived] = useState(false);
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpaTreatment | null>(null);

  const treatments = useSpaTreatments({ includeInactive: true });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return treatments.allTreatments.filter((t) => {
      if (!showArchived && !t.is_active) return false;
      if (category !== ALL && t.category !== category) return false;
      if (!term) return true;
      return [t.name, t.description, t.products_used, t.contraindications]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [treatments.allTreatments, showArchived, category, search]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (treatment: SpaTreatment) => {
    setEditing(treatment);
    setDialogOpen(true);
  };

  const submit = async (values: TreatmentFormData) => {
    await treatments.saveTreatment.mutateAsync(values);
    setDialogOpen(false);
    setEditing(null);
  };

  const isEmpty = !treatments.isLoading && !treatments.isError && treatments.allTreatments.length === 0;

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Sparkles}
        title="Treatment menu"
        description="Every treatment the spa offers. Bookings take their length and price from here."
        actions={
          canEdit ? (
            <>
              {treatments.allTreatments.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => treatments.seedMenu.mutate()}
                  disabled={treatments.seedMenu.isPending}
                >
                  Add the default menu
                </Button>
              )}
              <Button size="sm" onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> New treatment
              </Button>
            </>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search treatments, products or contraindications"
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="md:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {TREATMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
                Show archived
              </Label>
            </div>
          </div>
        }
      />

      <StatGrid>
        <StatTile
          icon={Sparkles}
          label="On the menu"
          value={treatments.isLoading ? null : treatments.summary.active}
        />
        <StatTile
          icon={Archive}
          label="Archived"
          value={treatments.isLoading ? null : treatments.summary.archived}
        />
        <StatTile
          icon={Sparkles}
          label="Categories in use"
          value={treatments.isLoading ? null : treatments.summary.categories}
        />
        <StatTile
          icon={Sparkles}
          label="Priced"
          value={treatments.isLoading ? null : treatments.summary.priced}
          hint={`${treatments.summary.active - treatments.summary.priced} without a price`}
          tone={treatments.summary.active > treatments.summary.priced ? 'warning' : 'good'}
        />
      </StatGrid>

      {treatments.isLoading ? (
        <HealthLoading rows={5} />
      ) : treatments.isError ? (
        <HealthError title="Could not load the treatment menu" error={treatments.error} />
      ) : isEmpty ? (
        <HealthEmpty
          icon={Sparkles}
          title="No treatments yet"
          description="Start from the standard menu of massages, facials, body and nail treatments, then adjust the lengths and prices to suit the vessel."
          action={
            canEdit ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => treatments.seedMenu.mutate()} disabled={treatments.seedMenu.isPending}>
                  {treatments.seedMenu.isPending ? 'Creating the menu…' : 'Create the default menu'}
                </Button>
                <Button variant="outline" onClick={openNew}>
                  <Plus className="mr-2 h-4 w-4" /> Add one treatment
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask the spa manager or the purser to build the menu.
              </p>
            )
          }
        />
      ) : rows.length === 0 ? (
        <HealthEmpty
          icon={Search}
          title="No treatment matches those filters"
          description="Clear the search or choose a different category to see the rest of the menu."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setCategory(ALL);
              }}
            >
              Clear the filters
            </Button>
          }
        />
      ) : (
        <>
          {/* Cards below md, table above: therapists work on tablets. */}
          <div className="grid gap-3 md:hidden">
            {rows.map((t) => (
              <Card key={t.id} className={cn(!t.is_active && 'opacity-60')}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {treatmentCategoryLabel(t.category)} · {formatDuration(t.duration_minutes)}
                        {t.buffer_minutes ? ` (+${t.buffer_minutes}m turnaround)` : ''}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm text-foreground">
                      {formatMinor(t.price_minor, t.currency ?? defaultCurrency)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.requires_room && (
                      <Badge variant="secondary" className="text-[10px]">
                        Needs a room
                      </Badge>
                    )}
                    {!t.is_active && (
                      <Badge variant="outline" className="text-[10px]">
                        Archived
                      </Badge>
                    )}
                    {t.contraindications && (
                      <Badge
                        variant="outline"
                        className="border-warning/20 bg-warning/10 text-[10px] text-warning"
                      >
                        Contraindications
                      </Badge>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(t)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          treatments.setTreatmentActive.mutate({ id: t.id, isActive: !t.is_active })
                        }
                      >
                        {t.is_active ? <Archive className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Treatment</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Length</TableHead>
                      <TableHead>Buffer</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Notes</TableHead>
                      {canEdit && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((t) => (
                      <TableRow key={t.id} className={cn(!t.is_active && 'opacity-60')}>
                        <TableCell>
                          <p className="font-medium text-foreground">{t.name}</p>
                          {t.description && (
                            <p className="max-w-xs truncate text-xs text-muted-foreground">
                              {t.description}
                            </p>
                          )}
                          {!t.is_active && (
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              Archived
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {treatmentCategoryLabel(t.category)}
                        </TableCell>
                        <TableCell className="text-sm">{formatDuration(t.duration_minutes)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.buffer_minutes ? `${t.buffer_minutes}m` : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatMinor(t.price_minor, t.currency ?? defaultCurrency)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.requires_room ? 'Required' : 'Not needed'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {t.contraindications && (
                              <Badge
                                variant="outline"
                                className="border-warning/20 bg-warning/10 text-[10px] text-warning"
                              >
                                Contraindications
                              </Badge>
                            )}
                            {t.products_used && (
                              <Badge variant="secondary" className="text-[10px]">
                                Products
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit {t.name}</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  treatments.setTreatmentActive.mutate({ id: t.id, isActive: !t.is_active })
                                }
                              >
                                {t.is_active ? (
                                  <Archive className="h-3.5 w-3.5" />
                                ) : (
                                  <ArchiveRestore className="h-3.5 w-3.5" />
                                )}
                                <span className="sr-only">
                                  {t.is_active ? 'Archive' : 'Restore'} {t.name}
                                </span>
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <TreatmentDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        treatment={editing}
        defaultCurrency={defaultCurrency}
        onSubmit={submit}
        isPending={treatments.saveTreatment.isPending}
      />
    </div>
  );
};

export default SpaTreatmentsPage;
