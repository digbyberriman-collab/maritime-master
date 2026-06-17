import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, AlertCircle, ArrowRight } from "lucide-react";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
}

interface ColumnMapperProps {
  fileName: string;
  headers: string[];
  rows: string[][];
  fields: FieldDef[];
  mapping: Record<number, string>;
  onMappingChange: (mapping: Record<number, string>) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ColumnMapper({ fileName, headers, rows, fields, mapping, onMappingChange, onBack, onNext }: ColumnMapperProps) {
  const mappedFields = Object.values(mapping).filter((v) => v !== "skip");
  const requiredFields = fields.filter((f) => f.required).map((f) => f.key);
  const hasAllRequired = requiredFields.every((k) => mappedFields.includes(k));
  const hasDuplicates = new Set(mappedFields).size !== mappedFields.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Map Columns — {fileName}
          <Badge variant="outline">{rows.length} rows</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Match each column from your file to a field. Columns mapped to "Skip" will be ignored.
        </p>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Column</TableHead>
                <TableHead>Sample Data</TableHead>
                <TableHead>Maps To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {headers.map((h, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{h}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {rows[0]?.[i] || "—"}
                  </TableCell>
                  <TableCell>
                    <Select value={mapping[i] || "skip"} onValueChange={(v) => onMappingChange({ ...mapping, [i]: v })}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label} {f.required ? "*" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!hasAllRequired && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> You must map: {requiredFields.filter((k) => !mappedFields.includes(k)).map((k) => fields.find((f) => f.key === k)?.label).join(", ")}
          </div>
        )}
        {hasDuplicates && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Each field can only be mapped once
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button disabled={!hasAllRequired || hasDuplicates} onClick={onNext}>
            Preview Import <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function autoMapColumns(fileHeaders: string[], fields: FieldDef[]): Record<number, string> {
  const newMapping: Record<number, string> = {};
  const fieldKeys = fields.map((f) => f.key);
  
  const aliases: Record<string, string[]> = {
    task_name: ["taskname", "task", "name", "activity", "activityname", "activityid"],
    start_date: ["start", "startdate", "earlystart", "actualstart", "plannedstart"],
    end_date: ["finish", "end", "enddate", "finishdate", "earlyfinish", "actualfinish"],
    duration_days: ["duration", "durationdays", "origdur", "originalduration", "remainingduration"],
    percent_complete: ["percentcomplete", "complete", "pctcomplete", "progress", "physical"],
    wbs: ["wbs", "wbscode", "activitycode"],
    outline_level: ["outlinelevel", "level", "indent"],
    predecessors: ["predecessors", "predecessor", "pred", "dependencies"],
    resource_names: ["resourcenames", "resource", "resources", "assignedto"],
    notes: ["notes", "comments", "description"],
    title: ["title", "name", "subject"],
    decision_text: ["decisiontext", "decision"],
    reasoning: ["reasoning", "rationale", "reason"],
    status: ["status", "state"],
    date: ["date", "decisiondate"],
  };

  fileHeaders.forEach((h, i) => {
    const normalized = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    let match = "skip";
    for (const key of fieldKeys) {
      if (key === "skip") continue;
      const keyAliases = aliases[key] || [key.replace(/_/g, "")];
      if (keyAliases.some((a) => normalized.includes(a) || a.includes(normalized))) {
        match = key;
        break;
      }
    }
    newMapping[i] = match;
  });
  return newMapping;
}
