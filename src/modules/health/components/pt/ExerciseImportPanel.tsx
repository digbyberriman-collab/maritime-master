import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { FileUp, ShieldCheck, Table2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/shared/hooks/use-toast';
import {
  DIFFICULTIES,
  EXERCISE_CATEGORIES,
  type FileImportRow,
} from '@/modules/health/hooks/usePtLibrary';

interface ExerciseImportPanelProps {
  sourceKey: string;
  sourceLabel: string;
  licence: string | null;
  attribution: string | null;
  importing: boolean;
  onImport: (rows: FileImportRow[]) => void;
}

type RawRow = Record<string, unknown>;

interface TargetField {
  key: keyof FileImportRow;
  label: string;
  required?: boolean;
  /** Column names an export of this kind usually uses. */
  guesses: string[];
}

const TARGET_FIELDS: TargetField[] = [
  { key: 'name', label: 'Name', required: true, guesses: ['name', 'title', 'exercise', 'exercise_name'] },
  { key: 'source_id', label: 'Source identifier', required: true, guesses: ['id', 'uuid', 'exercise_id', 'slug'] },
  { key: 'category', label: 'Category', guesses: ['category', 'type', 'exercise_type'] },
  { key: 'body_part', label: 'Body part', guesses: ['bodypart', 'body_part', 'bodyPart', 'region'] },
  { key: 'target_muscle', label: 'Target muscle', guesses: ['target', 'target_muscle', 'primary_muscle', 'muscle'] },
  { key: 'equipment', label: 'Equipment', guesses: ['equipment', 'equipment_name', 'gear'] },
  { key: 'difficulty', label: 'Difficulty', guesses: ['difficulty', 'level', 'experience'] },
  { key: 'instructions', label: 'Instructions', guesses: ['instructions', 'description', 'steps', 'howto'] },
  { key: 'coaching_cues', label: 'Coaching cues', guesses: ['cues', 'coaching_cues', 'tips'] },
  { key: 'video_url', label: 'Video link', guesses: ['video', 'video_url', 'youtube', 'gif'] },
  { key: 'image_url', label: 'Image link', guesses: ['image', 'image_url', 'gifurl', 'gifUrl', 'thumbnail'] },
];

const NONE = '__none__';

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => String(v)).join('\n') || null;
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value).trim();
  return text ? text : null;
};

const normaliseCategory = (value: string | null, fallback: string): string => {
  if (!value) return fallback;
  const lower = value.toLowerCase().replace(/\s+/g, '_');
  return EXERCISE_CATEGORIES.some((c) => c.value === lower) ? lower : fallback;
};

const normaliseDifficulty = (value: string | null): string | null => {
  if (!value) return null;
  const lower = value.toLowerCase();
  const direct = DIFFICULTIES.find((d) => d.value === lower);
  if (direct) return direct.value;
  if (lower.startsWith('begin') || lower === 'easy') return 'beginner';
  if (lower.startsWith('inter') || lower === 'medium') return 'intermediate';
  if (lower.startsWith('adv') || lower === 'expert' || lower === 'hard') return 'advanced';
  return null;
};

const guessMapping = (columns: string[]): Record<string, string> => {
  const mapping: Record<string, string> = {};
  for (const field of TARGET_FIELDS) {
    const match = columns.find((column) => {
      const lower = column.toLowerCase().replace(/[\s-]+/g, '_');
      return field.guesses.some((guess) => guess.toLowerCase().replace(/[\s-]+/g, '_') === lower);
    });
    mapping[field.key] = match ?? NONE;
  }
  return mapping;
};

/**
 * File import for the sources with no public API. The mapping is explicit so
 * nobody has to guess which column a file uses, and the licence has to be
 * confirmed before anything is written.
 */
export const ExerciseImportPanel: React.FC<ExerciseImportPanelProps> = ({
  sourceKey,
  sourceLabel,
  licence,
  attribution,
  importing,
  onImport,
}) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fallbackCategory, setFallbackCategory] = useState('strength');
  const [confirmed, setConfirmed] = useState(false);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setConfirmed(false);
    try {
      const text = await file.text();
      let parsed: RawRow[] = [];
      if (file.name.toLowerCase().endsWith('.json')) {
        const json = JSON.parse(text);
        const list = Array.isArray(json)
          ? json
          : Array.isArray((json as { exercises?: unknown }).exercises)
            ? (json as { exercises: RawRow[] }).exercises
            : Array.isArray((json as { data?: unknown }).data)
              ? (json as { data: RawRow[] }).data
              : [];
        parsed = list as RawRow[];
      } else {
        const result = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
        parsed = result.data;
      }
      if (!parsed.length) {
        toast({
          title: 'Nothing to import',
          description: 'The file has no rows we can read.',
          variant: 'destructive',
        });
        return;
      }
      const keys = Array.from(
        parsed.slice(0, 50).reduce((set, row) => {
          Object.keys(row ?? {}).forEach((k) => set.add(k));
          return set;
        }, new Set<string>()),
      );
      setRows(parsed);
      setColumns(keys);
      setMapping(guessMapping(keys));
    } catch (error) {
      toast({
        title: 'Could not read that file',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const mapped = useMemo<FileImportRow[]>(() => {
    if (!rows.length) return [];
    const pick = (row: RawRow, key: string): string | null => {
      const column = mapping[key];
      if (!column || column === NONE) return null;
      return asText(row[column]);
    };
    return rows
      .map((row) => ({
        name: pick(row, 'name') ?? '',
        source_id: pick(row, 'source_id') ?? '',
        category: normaliseCategory(pick(row, 'category'), fallbackCategory),
        body_part: pick(row, 'body_part'),
        target_muscle: pick(row, 'target_muscle'),
        equipment: pick(row, 'equipment'),
        difficulty: normaliseDifficulty(pick(row, 'difficulty')),
        instructions: pick(row, 'instructions'),
        coaching_cues: pick(row, 'coaching_cues'),
        video_url: pick(row, 'video_url'),
        image_url: pick(row, 'image_url'),
      }))
      .filter((row) => row.name && row.source_id);
  }, [rows, mapping, fallbackCategory]);

  const missingRequired = TARGET_FIELDS.filter(
    (f) => f.required && (!mapping[f.key] || mapping[f.key] === NONE),
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Import from a file</CardTitle>
        <CardDescription>
          {sourceLabel} has no open API on board. Export a JSON or CSV file, map its columns, then
          import. Rows already carrying the same identifier are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" />
            Choose a file
          </Button>
          {fileName && (
            <span className="text-sm text-muted-foreground">
              {fileName} · {rows.length} rows read
            </span>
          )}
        </div>

        {rows.length > 0 && (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Map the columns</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {TARGET_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={mapping[field.key] ?? NONE}
                      onValueChange={(value) =>
                        setMapping((prev) => ({ ...prev, [field.key]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not mapped</SelectItem>
                        {columns.map((column) => (
                          <SelectItem key={column} value={column}>
                            {column}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Category to use when the file does not say
                  </Label>
                  <Select value={fallbackCategory} onValueChange={setFallbackCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXERCISE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {missingRequired.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Map the required columns</AlertTitle>
                <AlertDescription>
                  {missingRequired.map((f) => f.label).join(' and ')} must be mapped before anything can
                  be imported. The identifier is what stops the same exercise arriving twice.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Table2 className="h-4 w-4" />
                Preview: {mapped.length} rows ready
              </p>
              <ScrollArea className="max-h-64 rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">Identifier</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">Category</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">Target</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">Equipment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.slice(0, 20).map((row, index) => (
                      <tr key={`${row.source_id}-${index}`} className="border-t border-border">
                        <td className="p-2 text-foreground">{row.name}</td>
                        <td className="p-2 text-muted-foreground">{row.source_id}</td>
                        <td className="p-2 text-muted-foreground">{row.category}</td>
                        <td className="p-2 text-muted-foreground">{row.target_muscle ?? '—'}</td>
                        <td className="p-2 text-muted-foreground">{row.equipment ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Licence</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  {sourceLabel} data is published under{' '}
                  <span className="font-medium text-foreground">{licence ?? 'an unstated licence'}</span>.
                  {attribution ? ` Attribution: ${attribution}.` : ''} Every row imported keeps that
                  licence and attribution on it.
                </p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`licence-${sourceKey}`}
                    checked={confirmed}
                    onCheckedChange={(value) => setConfirmed(value === true)}
                  />
                  <Label htmlFor={`licence-${sourceKey}`} className="text-sm font-normal leading-snug">
                    I confirm this vessel is licensed to use this data and that the attribution above is
                    correct.
                  </Label>
                </div>
              </AlertDescription>
            </Alert>

            <Button
              disabled={!confirmed || importing || missingRequired.length > 0 || mapped.length === 0}
              onClick={() => onImport(mapped)}
            >
              {importing ? 'Importing...' : `Import ${mapped.length} exercises`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ExerciseImportPanel;
