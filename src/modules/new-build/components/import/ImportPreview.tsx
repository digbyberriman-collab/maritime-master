import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldDef } from "./ColumnMapper";

interface ImportPreviewProps {
  mapping: Record<number, string>;
  rows: string[][];
  fields: FieldDef[];
  onBack: () => void;
  onImport: () => void;
  isPending: boolean;
  importCount: number;
}

export function ImportPreview({ mapping, rows, fields, onBack, onImport, isPending, importCount }: ImportPreviewProps) {
  const activeMappings = Object.entries(mapping).filter(([, v]) => v !== "skip");

  const getMappedRows = () =>
    rows.map((row) => {
      const obj: Record<string, string> = {};
      Object.entries(mapping).forEach(([colIdx, field]) => {
        if (field !== "skip") obj[field] = row[Number(colIdx)] || "";
      });
      return obj;
    });

  const mappedRows = getMappedRows();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview — {importCount} rows to import</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                {activeMappings.map(([idx, field]) => (
                  <TableHead key={idx}>{fields.find((f) => f.key === field)?.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappedRows.slice(0, 20).map((row, i) => (
                <TableRow key={i}>
                  {activeMappings.map(([, field]) => (
                    <TableCell key={field} className="text-sm">{row[field] || "—"}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length > 20 && (
          <p className="text-sm text-muted-foreground">Showing first 20 of {rows.length} rows</p>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onImport} disabled={isPending}>
            {isPending ? "Importing…" : `Import ${importCount} Rows`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
