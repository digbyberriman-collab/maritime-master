import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Library, Loader2, Settings2, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';
import { useNutritionFoods, useUnusedFoods } from '@/modules/health/hooks/useNutrition';

interface SettingsForm {
  units: string;
  default_currency: string;
  allow_self_logging: boolean;
  allow_crew_view_own_records: boolean;
  stock_expiry_warning_days: number;
  fitness_expiry_warning_days: number;
  notes: string | null;
}

const DEFAULT_FORM: SettingsForm = {
  units: 'metric',
  default_currency: 'EUR',
  allow_self_logging: true,
  allow_crew_view_own_records: true,
  stock_expiry_warning_days: 90,
  fitness_expiry_warning_days: 90,
  notes: null,
};

/** Company-level nutrition settings and food library housekeeping. */
const NutritionSettingsPage: React.FC = () => {
  const wellness = useWellnessAccess();
  const canAdmin = !wellness.loading && wellness.canAdmin;

  const { settings, isLoading, isError, error, updateSettings } = useHealthSettings();
  const library = useNutritionFoods({ includeInactive: true });
  const unused = useUnusedFoods();

  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      units: settings.units,
      default_currency: settings.default_currency,
      allow_self_logging: settings.allow_self_logging,
      allow_crew_view_own_records: settings.allow_crew_view_own_records,
      stock_expiry_warning_days: settings.stock_expiry_warning_days,
      fitness_expiry_warning_days: settings.fitness_expiry_warning_days,
      notes: settings.notes,
    });
  }, [settings]);

  const patch = (next: Partial<SettingsForm>) => setForm((prev) => ({ ...prev, ...next }));

  const unusedIds = useMemo(() => {
    const used = new Set(unused.data ?? []);
    return library.allFoods.filter((f) => f.is_active && !used.has(f.id)).map((f) => f.id);
  }, [library.allFoods, unused.data]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await updateSettings.mutateAsync({
      units: form.units,
      default_currency: form.default_currency.toUpperCase().slice(0, 3),
      allow_self_logging: form.allow_self_logging,
      allow_crew_view_own_records: form.allow_crew_view_own_records,
      stock_expiry_warning_days: form.stock_expiry_warning_days,
      fitness_expiry_warning_days: form.fitness_expiry_warning_days,
      notes: form.notes?.trim() || null,
    });
  };

  const archiveUnused = async () => {
    await library.archiveFoods.mutateAsync(unusedIds);
    setConfirmArchive(false);
    void unused.refetch();
  };

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Settings2}
        title="Nutrition settings"
        description="Company-wide settings for logging, units and the food library."
      />

      {!canAdmin && !wellness.loading && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Read only</AlertTitle>
          <AlertDescription>
            You can see how nutrition is configured. Changing it is a wellness admin job.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <HealthLoading rows={3} />
      ) : isError ? (
        <HealthError title="Could not load the settings" error={error} />
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Logging and units</CardTitle>
              <CardDescription>
                These apply across the whole health section, not only nutrition.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Units</Label>
                  <Select
                    value={form.units}
                    onValueChange={(v) => patch({ units: v })}
                    disabled={!canAdmin}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="metric">Metric (kg, cm)</SelectItem>
                      <SelectItem value="imperial">Imperial (lb, feet)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="settings-currency">Default currency</Label>
                  <Input
                    id="settings-currency"
                    maxLength={3}
                    disabled={!canAdmin}
                    value={form.default_currency}
                    onChange={(e) => patch({ default_currency: e.target.value.toUpperCase() })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used where a treatment or a stock line has no currency of its own.
                  </p>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="settings-self-logging">Let crew log their own food</Label>
                  <p className="text-xs text-muted-foreground">
                    Off means only the nutritionist and wellness staff can add entries.
                  </p>
                </div>
                <Switch
                  id="settings-self-logging"
                  disabled={!canAdmin}
                  checked={form.allow_self_logging}
                  onCheckedChange={(checked) => patch({ allow_self_logging: checked })}
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="settings-own-records">Let crew read their own records</Label>
                  <p className="text-xs text-muted-foreground">
                    Their nutrition profile, goals and food log. Clinical detail is governed separately.
                  </p>
                </div>
                <Switch
                  id="settings-own-records"
                  disabled={!canAdmin}
                  checked={form.allow_crew_view_own_records}
                  onCheckedChange={(checked) => patch({ allow_crew_view_own_records: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Warning windows</CardTitle>
              <CardDescription>How far ahead the section starts warning you.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-stock-days">Stock and food expiry (days)</Label>
                <Input
                  id="settings-stock-days"
                  type="number"
                  min={1}
                  disabled={!canAdmin}
                  value={form.stock_expiry_warning_days}
                  onChange={(e) => patch({ stock_expiry_warning_days: Number(e.target.value) || 1 })}
                />
                <p className="text-xs text-muted-foreground">
                  Drives the expiring filters on galley and spa stock.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-fitness-days">Fitness certificate expiry (days)</Label>
                <Input
                  id="settings-fitness-days"
                  type="number"
                  min={1}
                  disabled={!canAdmin}
                  value={form.fitness_expiry_warning_days}
                  onChange={(e) => patch({ fitness_expiry_warning_days: Number(e.target.value) || 1 })}
                />
                <p className="text-xs text-muted-foreground">
                  Nutrition plans built around a medical often follow this window.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="settings-notes">Notes</Label>
                <Textarea
                  id="settings-notes"
                  rows={3}
                  disabled={!canAdmin}
                  value={form.notes ?? ''}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder="Anything the next purser should know about how this is set up"
                />
              </div>
            </CardContent>
          </Card>

          {canAdmin && (
            <div className="flex justify-end">
              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save settings
              </Button>
            </div>
          )}
        </form>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Food library</CardTitle>
          <CardDescription>
            The shared list every food log and meal plan draws on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {library.isLoading ? (
            <HealthLoading rows={2} />
          ) : library.isError ? (
            <HealthError title="Could not load the food library" error={library.error} />
          ) : library.allFoods.length === 0 ? (
            <HealthEmpty
              icon={Library}
              title="No foods in the library"
              description="Build the library from the Food log page, under the Food library tab. Start with the dishes the galley serves most."
              className="border-0 p-6"
            />
          ) : (
            <>
              <StatGrid>
                <StatTile icon={Library} label="Foods in use" value={library.summary.active} />
                <StatTile icon={Library} label="Recipes" value={library.summary.recipes} />
                <StatTile
                  icon={Library}
                  label="With allergens declared"
                  value={library.summary.withAllergens}
                  hint={`${library.summary.active - library.summary.withAllergens} with none recorded`}
                />
                <StatTile icon={Archive} label="Archived" value={library.summary.archived} />
              </StatGrid>

              {unused.isLoading ? (
                <HealthLoading rows={1} />
              ) : unused.isError ? (
                <HealthError title="Could not work out which foods are unused" error={unused.error} />
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {unusedIds.length} {unusedIds.length === 1 ? 'food has' : 'foods have'} never been
                      logged or planned
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Archiving them tidies the picker. They stay in the database and can be restored at
                      any time.
                    </p>
                  </div>
                  {canAdmin && unusedIds.length > 0 && (
                    <Button
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setConfirmArchive(true)}
                      disabled={library.archiveFoods.isPending}
                    >
                      <Archive className="mr-2 h-4 w-4" /> Archive the unused
                    </Button>
                  )}
                </div>
              )}

              {library.summary.active > library.summary.withAllergens && (
                <Alert className="border-warning/40 bg-warning/5">
                  <AlertTitle>Some foods declare no allergens</AlertTitle>
                  <AlertDescription>
                    The meal calendar can only flag a clash against what a food declares. Go through the
                    library and add allergens to anything served to guests.
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {library.foods
                        .filter((f) => (f.allergens ?? []).length === 0)
                        .slice(0, 12)
                        .map((f) => (
                          <Badge key={f.id} variant="outline" className="text-[10px]">
                            {f.name}
                          </Badge>
                        ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {unusedIds.length} unused foods</AlertDialogTitle>
            <AlertDialogDescription>
              They will come out of the food picker and the recipe list. Nothing already logged changes,
              and any of them can be restored from the food library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Leave them</AlertDialogCancel>
            <AlertDialogAction onClick={archiveUnused}>Archive them</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NutritionSettingsPage;
