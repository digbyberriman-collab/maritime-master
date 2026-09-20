import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CloudDownload, DatabaseZap, KeyRound, Lock, PlugZap, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { ExerciseImportPanel } from '@/modules/health/components/pt/ExerciseImportPanel';
import { Fact } from '@/modules/health/components/pt/PtCommon';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useExerciseSources } from '@/modules/health/hooks/usePtLibrary';
import { SOURCE_BY_PATH } from '@/modules/health/paths';
import { formatDateTime } from '@/modules/health/lib/format';

/** Source keys the `pt-exercise-import` edge function can fetch for itself. */
const API_SOURCES = ['wger', 'exercisedb'];

const SOURCE_COPY: Record<string, { title: string; blurb: string }> = {
  wger: {
    title: 'wger',
    blurb:
      'An open exercise database with a public API and no key. Imported rows carry the wger licence and attribution.',
  },
  exercisedb: {
    title: 'ExerciseDB API',
    blurb:
      'A commercial database reached through RapidAPI. It needs a key, which is kept on the server and never sent back to the browser.',
  },
  exercisedb_import: {
    title: 'ExerciseDB import',
    blurb: 'Import an ExerciseDB export file instead of calling the API. Useful with a metered key.',
  },
  musclewiki: {
    title: 'MuscleWiki',
    blurb:
      'No public API. Import a file you hold a licence for. MuscleWiki content is all rights reserved, so check before importing.',
  },
  anatomytool: {
    title: 'AnatomyTOOL',
    blurb:
      'Anatomy illustrations from Leiden University. Licences vary per item, so confirm each set before importing.',
  },
  z_anatomy: {
    title: 'Z-Anatomy',
    blurb: 'Open source anatomy atlas published under CC-BY-SA 4.0. Import an export file.',
  },
};

/**
 * One page behind all six source routes. The route decides which connector
 * is configured, through SOURCE_BY_PATH.
 */
const ExerciseSourcePage: React.FC = () => {
  const location = useLocation();
  const access = useWellnessAccess();
  const sourceKey = SOURCE_BY_PATH[location.pathname] ?? 'wger';
  const copy = SOURCE_COPY[sourceKey] ?? { title: 'Exercise source', blurb: '' };

  const connectors = useExerciseSources();
  const source = connectors.sources.find((s) => s.source_key === sourceKey) ?? null;

  const [limit, setLimit] = useState('100');
  const [credential, setCredential] = useState('');
  const [notes, setNotes] = useState<string | null>(null);

  const isApi = API_SOURCES.includes(sourceKey);
  const needsKey = sourceKey === 'exercisedb';

  if (!access.loading && !access.canAdmin) {
    return (
      <div className="space-y-6">
        <HealthPageHeader icon={PlugZap} title={copy.title} description="Exercise import source." />
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Wellness administrators only</AlertTitle>
          <AlertDescription>
            These connectors hold API keys, so only a wellness administrator can read or change them.
            The exercises they import are visible to everyone in the exercise library.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={PlugZap}
        title={copy.title}
        description={copy.blurb}
        actions={
          source ? (
            <Badge
              variant="outline"
              className={
                source.is_enabled
                  ? 'border-success/20 bg-success/10 text-success'
                  : 'border-border bg-muted text-muted-foreground'
              }
            >
              {source.is_enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          ) : undefined
        }
      />

      {connectors.isLoading ? (
        <HealthLoading rows={3} />
      ) : connectors.isError ? (
        <HealthError error={connectors.error} title="Could not load the import connectors" />
      ) : !source ? (
        <HealthEmpty
          icon={DatabaseZap}
          title="The import connectors have not been created yet"
          description="Create them once for this company. Nothing is imported until you run an import here."
          action={
            <Button
              onClick={() => connectors.seedSources.mutate()}
              disabled={connectors.seedSources.isPending}
            >
              {connectors.seedSources.isPending ? 'Creating...' : 'Create the connectors'}
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Connector</CardTitle>
              <CardDescription>
                Status, licence and the last time anything was brought aboard from this source.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Exercises imported" value={source.imported_count} />
                <Fact
                  label="Last sync"
                  value={source.last_synced_at ? formatDateTime(source.last_synced_at) : 'Never'}
                />
                <Fact label="Last result" value={source.last_sync_status ?? '—'} />
                <Fact label="Endpoint" value={source.base_url ?? 'File import only'} />
                <Fact label="Licence" value={source.licence ?? 'Not stated'} className="col-span-2" />
                <Fact
                  label="Attribution"
                  value={source.attribution ?? 'Not stated'}
                  className="col-span-2"
                />
              </div>

              {source.last_sync_message && (
                <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {source.last_sync_message}
                </p>
              )}

              <div className="flex items-center gap-3 rounded-md border border-border p-3">
                <Switch
                  id="source-enabled"
                  checked={source.is_enabled}
                  onCheckedChange={(value) =>
                    connectors.saveSource.mutate({ id: source.id, values: { is_enabled: value } })
                  }
                />
                <Label htmlFor="source-enabled" className="cursor-pointer">
                  Enabled. Turning this off does not remove exercises already imported.
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="source-notes">Notes</Label>
                <Textarea
                  id="source-notes"
                  rows={2}
                  value={notes ?? source.notes ?? ''}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() =>
                    notes !== null &&
                    notes !== (source.notes ?? '') &&
                    connectors.saveSource.mutate({ id: source.id, values: { notes: notes || null } })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Alert>
            <AlertTitle>Licence travels with the data</AlertTitle>
            <AlertDescription>
              Every exercise imported here is stamped with{' '}
              <span className="font-medium text-foreground">{source.licence ?? 'the source licence'}</span>{' '}
              and its attribution, and the exercise library shows both. Do not strip them, and do not
              import anything this vessel is not licensed to use.
            </AlertDescription>
          </Alert>

          {needsKey && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">RapidAPI key</CardTitle>
                <CardDescription>
                  Stored server side on the connector row. It is never sent back to this browser, so
                  the field shows only whether a key is set.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <Badge
                    variant="outline"
                    className={
                      source.hasCredential
                        ? 'border-success/20 bg-success/10 text-success'
                        : 'border-warning/20 bg-warning/10 text-warning'
                    }
                  >
                    {source.hasCredential ? 'A key is stored' : 'No key stored'}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="source-credential">
                    {source.hasCredential ? 'Replace the key' : 'Set the key'}
                  </Label>
                  <Input
                    id="source-credential"
                    type="password"
                    autoComplete="off"
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    placeholder="Paste the RapidAPI key"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!credential.trim() || connectors.isMutating}
                    onClick={() =>
                      connectors.saveSource.mutate(
                        { id: source.id, values: { credential: credential.trim() } },
                        { onSuccess: () => setCredential('') },
                      )
                    }
                  >
                    Save the key
                  </Button>
                  {source.hasCredential && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={connectors.isMutating}
                      onClick={() =>
                        connectors.saveSource.mutate({ id: source.id, values: { credential: null } })
                      }
                    >
                      Remove the key
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isApi ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Run an import</CardTitle>
                <CardDescription>
                  The import runs on the server. Exercises already carrying the same source identifier
                  are skipped, so running it twice is safe.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 sm:max-w-xs">
                  <Label htmlFor="import-limit">How many to fetch</Label>
                  <Input
                    id="import-limit"
                    type="number"
                    min={1}
                    max={2000}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </div>
                {needsKey && !source.hasCredential && (
                  <Alert variant="destructive">
                    <AlertTitle>Set the key first</AlertTitle>
                    <AlertDescription>
                      This source will not answer without a RapidAPI key on the connector.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  disabled={
                    connectors.runApiImport.isPending || (needsKey && !source.hasCredential) || !source.is_enabled
                  }
                  onClick={() =>
                    connectors.runApiImport.mutate({
                      sourceKey,
                      limit: Math.max(1, Number(limit) || 100),
                    })
                  }
                >
                  {connectors.runApiImport.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CloudDownload className="mr-2 h-4 w-4" />
                      Import from {copy.title}
                    </>
                  )}
                </Button>
                {!source.is_enabled && (
                  <p className="text-xs text-muted-foreground">
                    Enable the connector above before running an import.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <ExerciseImportPanel
              sourceKey={sourceKey}
              sourceLabel={source.label}
              licence={source.licence}
              attribution={source.attribution}
              importing={connectors.importFileRows.isPending}
              onImport={(rows) =>
                connectors.importFileRows.mutate({
                  sourceKey,
                  rows,
                  licence: source.licence,
                  attribution: source.attribution,
                })
              }
            />
          )}
        </>
      )}
    </div>
  );
};

export default ExerciseSourcePage;
