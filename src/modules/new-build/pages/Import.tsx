import { useState } from "react";
import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { supabase } from "@/modules/new-build/lib/supabase";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, FileSpreadsheet, CalendarDays } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { FileUploadZone } from "@/modules/new-build/components/import/FileUploadZone";
import { ColumnMapper, autoMapColumns, FieldDef } from "@/modules/new-build/components/import/ColumnMapper";
import { ImportPreview } from "@/modules/new-build/components/import/ImportPreview";

type Step = "choose" | "upload" | "map" | "preview" | "done";
type ImportTarget = "decisions" | "schedule";

const DECISION_FIELDS: FieldDef[] = [
  { key: "skip", label: "— Skip —" },
  { key: "title", label: "Title / Description", required: true },
  { key: "item_type", label: "Type (decision/assumption/risk/issue)" },
  { key: "raid_status", label: "Status (current/accepted/closed/…)" },
  { key: "decision_text", label: "Description" },
  { key: "background", label: "Background / Mitigation" },
  { key: "reasoning", label: "Reasoning" },
  { key: "assigned_owner", label: "Owner" },
  { key: "source_reference", label: "Source Reference" },
  { key: "reviewer_comment", label: "Reviewer Comment" },
  { key: "tags", label: "Tags" },
  { key: "date", label: "Date Raised" },
  { key: "notes", label: "Notes" },
  { key: "mdal_number", label: "MDAL Number" },
];

const SCHEDULE_FIELDS: FieldDef[] = [
  { key: "skip", label: "— Skip —" },
  { key: "task_name", label: "Task Name", required: true },
  { key: "start_date", label: "Start Date" },
  { key: "end_date", label: "End Date" },
  { key: "duration_days", label: "Duration (days)" },
  { key: "percent_complete", label: "% Complete" },
  { key: "wbs", label: "WBS Code" },
  { key: "outline_level", label: "Outline Level" },
  { key: "predecessors", label: "Predecessors" },
  { key: "resource_names", label: "Resource Names" },
  { key: "notes", label: "Notes" },
];

export default function Import() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const projectId = currentProject?.id;
  const userId = user?.id || "00000000-0000-0000-0000-000000000000";

  const [step, setStep] = useState<Step>("choose");
  const [target, setTarget] = useState<ImportTarget>("decisions");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importResult, setImportResult] = useState<{ imported: number; errors: number }>({ imported: 0, errors: 0 });

  const fields = target === "decisions" ? DECISION_FIELDS : SCHEDULE_FIELDS;

  const resetState = () => {
    setStep("choose");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setImportResult({ imported: 0, errors: 0 });
  };

  const handleParsed = (name: string, hdrs: string[], rws: string[][]) => {
    setFileName(name);
    setHeaders(hdrs);
    setRows(rws);
    setMapping(autoMapColumns(hdrs, fields));
    setStep("map");
  };

  const getMappedRows = () =>
    rows.map((row) => {
      const obj: Record<string, string> = {};
      Object.entries(mapping).forEach(([colIdx, field]) => {
        if (field !== "skip") obj[field] = row[Number(colIdx)] || "";
      });
      return obj;
    });

  const validRaidTypes = ["decision", "assumption", "risk", "issue", "key_project_risk"];
  const validRaidStatuses = ["current", "accepted", "closed", "superseded", "action", "rejected", "question_asked"];

  const parseNumber = (v: string | undefined): number | null => {
    if (!v) return null;
    const cleaned = v.replace(/[%,]/g, "").trim();
    const n = Number(cleaned);
    return isNaN(n) ? null : n;
  };

  const parseDate = (v: string | undefined): string | null => {
    if (!v?.trim()) return null;
    const d = new Date(v.trim());
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No project selected");
      const mapped = getMappedRows();
      let imported = 0;
      let errors = 0;

      if (target === "decisions") {
        const valid = mapped.filter((r) => r.title?.trim());
        for (const row of valid) {
          const itemType = validRaidTypes.includes(row.item_type?.toLowerCase()) ? row.item_type.toLowerCase() : "decision";
          const raidStatus = validRaidStatuses.includes(row.raid_status?.toLowerCase()) ? row.raid_status.toLowerCase() : "current";
          const pendingStatuses = ["current", "action", "question_asked"];
          const pending = pendingStatuses.includes(raidStatus);

          const { error } = await supabase.from("nb_decisions").insert({
            title: row.title.trim(),
            item_type: itemType as any,
            raid_status: raidStatus as any,
            pending_validation: pending,
            decision_text: row.decision_text?.trim() || null,
            background: row.background?.trim() || null,
            reasoning: row.reasoning?.trim() || null,
            assigned_owner: row.assigned_owner?.trim() || null,
            source_reference: row.source_reference?.trim() || null,
            reviewer_comment: row.reviewer_comment?.trim() || null,
            tags: row.tags?.trim() || null,
            mdal_number: row.mdal_number?.trim() || null,
            status: "idea" as any,
            date: parseDate(row.date),
            notes: row.notes?.trim() || null,
            project_id: projectId,
            created_by: userId,
          });
          if (error) errors++;
          else imported++;
        }
      } else {
        // Schedule tasks - first log the import
        const { data: importLog } = await supabase.from("nb_timeline_imports").insert({
          project_id: projectId,
          original_filename: fileName,
          imported_by: userId,
          row_count: 0,
        }).select("id").single();

        const importId = importLog?.id || null;
        const valid = mapped.filter((r) => r.task_name?.trim());

        for (const row of valid) {
          const { error } = await supabase.from("schedule_tasks" as any).insert({
            task_name: row.task_name.trim(),
            start_date: parseDate(row.start_date),
            end_date: parseDate(row.end_date),
            duration_days: parseNumber(row.duration_days),
            percent_complete: parseNumber(row.percent_complete),
            wbs: row.wbs?.trim() || null,
            outline_level: parseNumber(row.outline_level) || 1,
            predecessors: row.predecessors?.trim() || null,
            resource_names: row.resource_names?.trim() || null,
            notes: row.notes?.trim() || null,
            project_id: projectId,
            import_id: importId,
          } as any);
          if (error) errors++;
          else imported++;
        }

        // Update the import log with actual row count
        if (importId) {
          await supabase.from("nb_timeline_imports").update({ row_count: imported } as any).eq("id", importId);
        }
      }

      // Log the import for decisions too
      if (target === "decisions") {
        await supabase.from("nb_timeline_imports").insert({
          project_id: projectId,
          original_filename: fileName,
          imported_by: userId,
          row_count: imported,
        });
      }

      return { imported, errors };
    },
    onSuccess: (result) => {
      setImportResult(result);
      setStep("done");
      const key = target === "decisions" ? "decisions" : "schedule_tasks";
      queryClient.invalidateQueries({ queryKey: [key, projectId] });
      queryClient.invalidateQueries({ queryKey: ["timeline_imports", projectId] });
      toast({ title: `Imported ${result.imported} ${target === "decisions" ? "decisions" : "schedule tasks"}` });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const requiredKey = target === "decisions" ? "title" : "task_name";
  const importCount = getMappedRows().filter((r) => r[requiredKey]?.trim()).length;

  const stepLabels: Record<Step, string> = {
    choose: "Choose Type",
    upload: "Upload",
    map: "Map Columns",
    preview: "Preview",
    done: "Done",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import — {currentProject?.name}</h1>
        <p className="text-muted-foreground mt-1">Upload Excel or CSV files to bulk-import RAID items or schedule tasks</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {(["choose", "upload", "map", "preview", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            <Badge variant={step === s ? "default" : "outline"} className="capitalize">
              {i + 1}. {stepLabels[s]}
            </Badge>
          </div>
        ))}
      </div>

      {/* Step 1: Choose import type */}
      {step === "choose" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => { setTarget("decisions"); setStep("upload"); }}
          >
            <CardContent className="py-8 text-center space-y-3">
              <FileSpreadsheet className="h-10 w-10 mx-auto text-primary" />
              <h3 className="text-lg font-semibold">RAID Log (MDAL)</h3>
              <p className="text-sm text-muted-foreground">Import decisions, assumptions, risks & issues from Monday or other sources</p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => { setTarget("schedule"); setStep("upload"); }}
          >
            <CardContent className="py-8 text-center space-y-3">
              <CalendarDays className="h-10 w-10 mx-auto text-primary" />
              <h3 className="text-lg font-semibold">Schedule / Gantt</h3>
              <p className="text-sm text-muted-foreground">Import tasks from MS Project, Primavera P6, or any schedule export</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Upload */}
      {step === "upload" && <FileUploadZone onParsed={handleParsed} />}

      {/* Step 3: Map Columns */}
      {step === "map" && (
        <ColumnMapper
          fileName={fileName}
          headers={headers}
          rows={rows}
          fields={fields}
          mapping={mapping}
          onMappingChange={setMapping}
          onBack={resetState}
          onNext={() => setStep("preview")}
        />
      )}

      {/* Step 4: Preview */}
      {step === "preview" && (
        <ImportPreview
          mapping={mapping}
          rows={rows}
          fields={fields}
          onBack={() => setStep("map")}
          onImport={() => importMutation.mutate()}
          isPending={importMutation.isPending}
          importCount={importCount}
        />
      )}

      {/* Step 5: Done */}
      {step === "done" && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Check className="h-12 w-12 mx-auto text-green-600" />
            <h2 className="text-xl font-semibold">Import Complete</h2>
            <p className="text-muted-foreground">
              {importResult.imported} {target === "decisions" ? "decisions" : "schedule tasks"} imported
              {importResult.errors > 0 && `, ${importResult.errors} rows had errors`}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={resetState}>Import Another File</Button>
              <Button onClick={() => window.location.assign(target === "decisions" ? "/decisions" : "/timeline")}>
                View {target === "decisions" ? "Decisions" : "Timeline"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
